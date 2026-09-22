import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelConfig } from './entities/channel-config.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class MetaOauthService {
  private readonly logger = new Logger(MetaOauthService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ChannelConfig)
    private readonly channelConfigRepo: Repository<ChannelConfig>,
  ) {}

  /**
   * Genera la URL de autorización oficial de Meta para Facebook Login for Business.
   * Permite aislar los permisos según el canal que se esté conectando ('facebook' o 'instagram').
   */
  getAuthUrl(tenantSchema: string, userId: string, channel: string = 'facebook'): string {
    const appId = this.configService.get<string>('META_APP_ID') || '27443728448663271';
    const redirectUri =
      this.configService.get<string>('META_REDIRECT_URI') ||
      'http://localhost:3091/api/conversations/oauth/facebook/callback';

    const normalizedChannel = (channel || 'facebook').toLowerCase() === 'instagram' ? 'instagram' : 'facebook';

    // Payload de estado seguro para correlacionar inquilino, usuario y canal en el callback
    const statePayload = JSON.stringify({
      tenantSchema,
      userId,
      channel: normalizedChannel,
      timestamp: Date.now(),
    });
    const state = Buffer.from(statePayload).toString('base64');

    let scopes: string[];
    if (normalizedChannel === 'instagram') {
      scopes = [
        'pages_show_list',
        'pages_manage_metadata',
        'instagram_basic',
        'instagram_manage_messages',
        'public_profile',
      ];
    } else {
      // Exclusivo para Facebook Messenger
      scopes = [
        'pages_show_list',
        'pages_manage_metadata',
        'pages_messaging',
        'public_profile',
      ];
    }

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: scopes.join(','),
      response_type: 'code',
      auth_type: 'rerequest',
    });

    return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  }

  /**
   * Procesa el callback de Meta OAuth2, canjea el código por tokens de página,
   * suscribe los webhooks y persiste la configuración en el esquema del tenant.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (!code || !state) {
      return { success: false, message: 'Falta código de autorización o estado.' };
    }

    let tenantSchema = 'public';
    let userId = '';
    let targetChannel = 'facebook';

    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      tenantSchema = decodedState.tenantSchema || 'public';
      userId = decodedState.userId || '';
      targetChannel = (decodedState.channel || 'facebook').toLowerCase();
    } catch (err: any) {
      this.logger.error(`[handleCallback] Error decodificando state: ${err.message}`);
      return { success: false, message: 'Estado OAuth2 inválido o corrupto.' };
    }

    const appId = this.configService.get<string>('META_APP_ID') || '27443728448663271';
    const appSecret = this.configService.get<string>('META_APP_SECRET') || '';
    const redirectUri =
      this.configService.get<string>('META_REDIRECT_URI') ||
      'http://localhost:3091/api/conversations/oauth/facebook/callback';

    if (!appSecret) {
      this.logger.error('[handleCallback] META_APP_SECRET no está configurado en las variables de entorno.');
      return { success: false, message: 'El servidor no tiene configurado META_APP_SECRET.' };
    }

    try {
      // 1. Canjear código por User Access Token (de corta duración)
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&client_secret=${appSecret}&code=${code}`;

      const tokenRes = await fetch(tokenUrl, { signal: AbortSignal.timeout(8000) });
      const tokenData: any = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        const errorMsg = tokenData?.error?.message || 'Error al canjear código por token de usuario en Meta.';
        this.logger.error(`[handleCallback] Error canjeando token: ${errorMsg}`);
        return { success: false, message: errorMsg };
      }

      const shortLivedUserToken = tokenData.access_token;

      // 2. Canjear por Long-Lived User Access Token (válido hasta 60 días)
      let longLivedUserToken = shortLivedUserToken;
      try {
        const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedUserToken}`;
        const exchangeRes = await fetch(exchangeUrl, { signal: AbortSignal.timeout(8000) });
        if (exchangeRes.ok) {
          const exchangeData: any = await exchangeRes.json();
          if (exchangeData.access_token) {
            longLivedUserToken = exchangeData.access_token;
            this.logger.log('[handleCallback] Token de usuario de larga duración obtenido con éxito.');
          }
        }
      } catch (err: any) {
        this.logger.warn(`[handleCallback] No se pudo obtener long-lived token, usando token directo: ${err.message}`);
      }

      // 3. Obtener Páginas de Facebook administradas y sus cuentas de Instagram vinculadas
      const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url}&access_token=${longLivedUserToken}`;
      const accountsRes = await fetch(accountsUrl, { signal: AbortSignal.timeout(8000) });
      const accountsData: any = await accountsRes.json();
      let pages: any[] = (accountsData && Array.isArray(accountsData.data)) ? accountsData.data : [];

      // Fallback 1: Si /me/accounts no devolvió páginas pero el usuario seleccionó páginas en Granular Scopes
      if (pages.length === 0) {
        this.logger.log('[handleCallback] /me/accounts devolvió lista vacía. Consultando granular_scopes en debug_token...');
        try {
          const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${longLivedUserToken}&access_token=${appId}|${appSecret}`;
          const debugRes = await fetch(debugUrl, { signal: AbortSignal.timeout(6000) });
          if (debugRes.ok) {
            const debugData: any = await debugRes.json();
            this.logger.log(`[handleCallback] debug_token data: ${JSON.stringify(debugData?.data?.granular_scopes || debugData)}`);
            const granularScopes = debugData?.data?.granular_scopes || [];

            const targetIds = new Set<string>();
            for (const s of granularScopes) {
              if (Array.isArray(s.target_ids)) {
                s.target_ids.forEach((tid: string) => targetIds.add(tid));
              }
            }

            for (const pId of targetIds) {
              try {
                const pageUrl = `https://graph.facebook.com/v19.0/${pId}?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${longLivedUserToken}`;
                const pageRes = await fetch(pageUrl, { signal: AbortSignal.timeout(6000) });
                if (pageRes.ok) {
                  const pData: any = await pageRes.json();
                  if (pData && pData.id) {
                    pages.push({
                      id: pData.id,
                      name: pData.name,
                      access_token: pData.access_token || longLivedUserToken,
                      instagram_business_account: pData.instagram_business_account,
                    });
                  }
                }
              } catch (err: any) {
                this.logger.warn(`[handleCallback] Error obteniendo página granular ${pId}: ${err.message}`);
              }
            }
          }
        } catch (err: any) {
          this.logger.warn(`[handleCallback] Error en fallback de debug_token: ${err.message}`);
        }
      }

      // Fallback 2: Consultar páginas a través de Meta Business Portfolio (/me/businesses)
      if (pages.length === 0) {
        this.logger.log('[handleCallback] Consultando páginas en /me/businesses...');
        try {
          const bizUrl = `https://graph.facebook.com/v19.0/me/businesses?fields=id,name,client_pages{id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}},owned_pages{id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}}&access_token=${longLivedUserToken}`;
          const bizRes = await fetch(bizUrl, { signal: AbortSignal.timeout(6000) });
          if (bizRes.ok) {
            const bizData: any = await bizRes.json();
            const businesses = bizData.data || [];
            for (const biz of businesses) {
              const bPages = [...(biz.owned_pages?.data || []), ...(biz.client_pages?.data || [])];
              for (const bp of bPages) {
                if (bp && bp.id && !pages.some((existing: any) => existing.id === bp.id)) {
                  pages.push(bp);
                }
              }
            }
          }
        } catch (err: any) {
          this.logger.warn(`[handleCallback] Error en fallback de businesses: ${err.message}`);
        }
      }

      if (pages.length === 0) {
        return {
          success: false,
          message: 'No se encontraron Páginas de Facebook administradas por esta cuenta. Asegúrate de tener permisos de administrador en al menos una página y haberla seleccionado en el diálogo de Meta.',
        };
      }

      // Conectar la página autorizada: si es Instagram, priorizar la página que tenga cuenta de Instagram vinculada
      let targetPage = pages[0];
      if (targetChannel === 'instagram') {
        const pageWithIg = pages.find((p: any) => p.instagram_business_account && p.instagram_business_account.id);
        if (pageWithIg) {
          targetPage = pageWithIg;
        } else {
          // Si el listado inicial no expandió instagram_business_account, consultar individualmente
          for (const p of pages) {
            try {
              const checkUrl = `https://graph.facebook.com/v19.0/${p.id}?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${p.access_token || longLivedUserToken}`;
              const checkRes = await fetch(checkUrl, { signal: AbortSignal.timeout(5000) });
              if (checkRes.ok) {
                const cData: any = await checkRes.json();
                if (cData?.instagram_business_account?.id) {
                  p.instagram_business_account = cData.instagram_business_account;
                  p.access_token = cData.access_token || p.access_token;
                  targetPage = p;
                  break;
                }
              }
            } catch (err: any) {
              this.logger.warn(`[handleCallback] Error verificando IG en página ${p.id}: ${err.message}`);
            }
          }
        }
      }

      const pageId = targetPage.id;
      const pageName = targetPage.name;
      const pageAccessToken = targetPage.access_token;
      const linkedIg = targetPage.instagram_business_account;

      this.logger.log(`[handleCallback] Vinculando página seleccionada: ${pageName} (${pageId}) para canal ${targetChannel}`);

      // 4. Suscribir automáticamente la página a los webhooks de la App (subscribed_apps)
      try {
        const subscribeUrl = `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${pageAccessToken}`;
        const subRes = await fetch(subscribeUrl, { method: 'POST', signal: AbortSignal.timeout(5000) });
        const subData: any = await subRes.json().catch(() => ({}));
        if (subRes.ok && subData.success) {
          this.logger.log(`[handleCallback] Webhook auto-suscrito con éxito para la página ${pageId}`);
        } else {
          this.logger.warn(`[handleCallback] Respuesta al suscribir webhook: ${JSON.stringify(subData)}`);
        }
      } catch (subErr: any) {
        this.logger.warn(`[handleCallback] Error suscribiendo webhook a la página: ${subErr.message}`);
      }

      // 5. Persistir de forma aislada en el esquema PostgreSQL del tenant
      return await TenantContextService.run({ tenantSchema, userId }, async () => {
        const repo = this.channelConfigRepo.manager.getRepository(ChannelConfig);

        if (targetChannel === 'instagram') {
          // --- CANAL INSTAGRAM EXCLUSIVO ---
          if (!linkedIg || !linkedIg.id) {
            return {
              success: false,
              message: `La página '${pageName}' no tiene una cuenta de Instagram Business vinculada en Meta Business Suite. Por favor vincula tu cuenta de Instagram a la página en Meta primero.`,
            };
          }

          const igId = linkedIg.id;
          const igName = linkedIg.username ? `@${linkedIg.username}` : (linkedIg.name || 'Instagram Business');

          let igConfig = await repo.findOne({
            where: [
              { channel: 'instagram', accountId: igId },
              { channel: 'instagram' },
            ],
          });

          if (!igConfig) {
            igConfig = repo.create({
              channel: 'instagram',
              name: igName,
              appId,
              accountId: igId,
              accessToken: pageAccessToken, // El token de página administra Instagram Messaging
              verifyToken: 'meta_oauth_auto',
              isActive: true,
            });
          } else {
            igConfig.name = igName;
            igConfig.accountId = igId;
            igConfig.appId = appId;
            igConfig.accessToken = pageAccessToken;
            igConfig.isActive = true;
          }
          await repo.save(igConfig);
          this.logger.log(`[handleCallback] Canal de Instagram guardado exclusivamente en esquema ${tenantSchema}: ${igName}`);

          return {
            success: true,
            message: `Cuenta de Instagram (${igName}) vinculada exitosamente.`,
            data: {
              instagram: { id: igId, username: linkedIg.username, name: linkedIg.name },
              tenantSchema,
            },
          };
        } else {
          // --- CANAL FACEBOOK EXCLUSIVO ---
          let fbConfig = await repo.findOne({
            where: [
              { channel: 'facebook', accountId: pageId },
              { channel: 'facebook' },
            ],
          });

          if (!fbConfig) {
            fbConfig = repo.create({
              channel: 'facebook',
              name: pageName || 'Página de Facebook',
              appId,
              accountId: pageId,
              accessToken: pageAccessToken,
              verifyToken: 'meta_oauth_auto',
              isActive: true,
            });
          } else {
            fbConfig.name = pageName || fbConfig.name;
            fbConfig.accountId = pageId;
            fbConfig.appId = appId;
            fbConfig.accessToken = pageAccessToken;
            fbConfig.isActive = true;
          }
          await repo.save(fbConfig);
          this.logger.log(`[handleCallback] Canal de Facebook guardado exclusivamente en esquema ${tenantSchema}: ${pageName}`);

          return {
            success: true,
            message: `Página de Facebook (${pageName}) vinculada exitosamente.`,
            data: {
              page: { id: pageId, name: pageName },
              tenantSchema,
            },
          };
        }
      });
    } catch (error: any) {
      this.logger.error(`[handleCallback] Excepción procesando Meta OAuth callback: ${error.message}`, error.stack);
      return { success: false, message: `Error interno procesando vinculación: ${error.message}` };
    }
  }

  /**
   * Genera el HTML de respuesta para ventanas emergentes (Popup).
   * Notifica a la ventana padre mediante window.opener.postMessage y se cierra automáticamente.
   */
  renderPopupResponse(success: boolean, message: string, data?: any): string {
    const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(/\/$/, '');
    const serializedData = JSON.stringify({ success, message, data: data || null });

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Conexión con Meta</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .card {
      background: white;
      padding: 2.5rem;
      border-radius: 1rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 420px;
      width: 90%;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      color: ${success ? '#059669' : '#dc2626'};
    }
    p {
      margin: 0 0 1.5rem 0;
      color: #64748b;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #e2e8f0;
      border-radius: 9999px;
      font-size: 0.8rem;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '🎉' : '⚠️'}</div>
    <h2>${success ? '¡Conexión Exitosa!' : 'Error de Conexión'}</h2>
    <p>${message}</p>
    <div class="badge">Esta ventana se cerrará automáticamente...</div>
  </div>

  <script>
    (function() {
      var payload = ${serializedData};
      if (window.opener) {
        window.opener.postMessage({
          type: '${success ? 'META_OAUTH_SUCCESS' : 'META_OAUTH_ERROR'}',
          payload: payload
        }, '*');
        setTimeout(function() {
          window.close();
        }, 1500);
      } else {
        setTimeout(function() {
          window.location.href = '${frontendUrl}/conversations?meta_oauth=${success ? 'success' : 'error'}';
        }, 2000);
      }
    })();
  </script>
</body>
</html>`;
  }
}
