import { MetaOauthService } from './meta-oauth.service';

describe('MetaOauthService', () => {
  const validTenant = 'tenant_teter';
  const validUserId = '7f415d8c-6955-438c-a84e-67aae9738b71';

  let service: MetaOauthService;
  let mockRepo: any;
  let savedConfig: any;

  beforeEach(() => {
    savedConfig = null;
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (entity) => {
        savedConfig = entity;
        return entity;
      }),
    };
    mockRepo = {
      manager: {
        query: jest.fn().mockResolvedValue([]),
        getRepository: jest.fn().mockReturnValue(tenantRepo),
      },
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'META_APP_ID') return '27443728448663271';
        if (key === 'META_APP_SECRET') return 'test-secret';
        if (key === 'META_REDIRECT_URI') return 'https://example.com/callback';
        return undefined;
      }),
    };

    service = new MetaOauthService(configService as any, mockRepo);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests full Business Portfolio permissions per channel without leaking instagram scopes to facebook', () => {
    const fbUrl = new URL(service.getAuthUrl(validTenant, validUserId, 'facebook'));
    const fbScopes = (fbUrl.searchParams.get('scope') || '').split(',');
    expect(fbScopes).toEqual([
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_messaging',
      'business_management',
      'public_profile',
    ]);

    const igUrl = new URL(service.getAuthUrl(validTenant, validUserId, 'instagram'));
    const igScopes = (igUrl.searchParams.get('scope') || '').split(',');
    expect(igScopes).toEqual([
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'business_management',
      'instagram_basic',
      'instagram_manage_messages',
      'public_profile',
    ]);
  });

  it('resolves a Business Portfolio page via Fallback 1 filtering only pages_* target_ids and omitting instagram_business_account when channel is facebook', async () => {
    const fetchedUrls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      fetchedUrls.push(url);

      if (url.includes('grant_type=fb_exchange_token')) {
        return new Response(JSON.stringify({ access_token: 'long-user-token' }), { status: 200 });
      }
      if (url.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'short-user-token' }), { status: 200 });
      }
      if (url.includes('/me/accounts')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes('/debug_token')) {
        return new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              user_id: '2161729151385726',
              scopes: ['pages_show_list', 'pages_read_engagement', 'pages_messaging'],
              granular_scopes: [
                { scope: 'pages_show_list', target_ids: ['1303515532835177'] },
                { scope: 'instagram_basic', target_ids: ['17841416570135436'] },
                { scope: 'business_management', target_ids: ['999999999999'] },
              ],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/1303515532835177?')) {
        return new Response(
          JSON.stringify({
            id: '1303515532835177',
            name: 'Pagina Pruebas',
            access_token: 'page-access-token-123',
          }),
          { status: 200 },
        );
      }
      if (url.includes('/subscribed_apps')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: 'Unexpected URL' } }), { status: 400 });
    });

    const state = Buffer.from(
      JSON.stringify({ tenantSchema: validTenant, userId: validUserId, channel: 'facebook' }),
    ).toString('base64');

    const res = await service.handleCallback('oauth-code', state);

    expect(res.success).toBe(true);
    expect(savedConfig).toMatchObject({
      channel: 'facebook',
      accountId: '1303515532835177',
      accessToken: 'page-access-token-123',
    });
    expect(fetchedUrls.some((u) => u.includes('17841416570135436'))).toBe(false);
    expect(fetchedUrls.some((u) => u.includes('999999999999'))).toBe(false);
    expect(fetchedUrls.some((u) => u.includes('/me/accounts') && u.includes('instagram_business_account'))).toBe(false);
    expect(fetchedUrls.some((u) => u.includes('/1303515532835177?') && u.includes('instagram_business_account'))).toBe(
      false,
    );
  });

  it('falls back to /me/businesses when Fallback 1 lacks page access_token and returns explicit Full Control error if neither issues one', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);

      if (url.includes('grant_type=fb_exchange_token')) {
        return new Response(JSON.stringify({ access_token: 'long-user-token' }), { status: 200 });
      }
      if (url.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'short-user-token' }), { status: 200 });
      }
      if (url.includes('/me/accounts')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes('/debug_token')) {
        return new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              granular_scopes: [{ scope: 'pages_show_list', target_ids: ['1303515532835177'] }],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/1303515532835177?')) {
        return new Response(JSON.stringify({ id: '1303515532835177', name: 'Pagina Pruebas' }), { status: 200 });
      }
      if (url.includes('/me/businesses')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'biz-1', owned_pages: { data: [{ id: '1303515532835177', name: 'Pagina Pruebas' }] } }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 400 });
    });

    const state = Buffer.from(
      JSON.stringify({ tenantSchema: validTenant, userId: validUserId, channel: 'facebook' }),
    ).toString('base64');

    const res = await service.handleCallback('oauth-code', state);

    expect(res.success).toBe(false);
    expect(res.message).toContain('Page Access Token');
    expect(res.message).toContain('Control Total');
  });

  it('resolves Instagram via /me/businesses when /me/accounts is empty and Fallback 1 lacks page token', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);

      if (url.includes('grant_type=fb_exchange_token')) {
        return new Response(JSON.stringify({ access_token: 'long-user-token' }), { status: 200 });
      }
      if (url.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'short-user-token' }), { status: 200 });
      }
      if (url.includes('/me/accounts')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes('/debug_token')) {
        return new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              granular_scopes: [
                { scope: 'pages_show_list', target_ids: ['1303515532835177'] },
                { scope: 'instagram_basic', target_ids: ['17841416570135436'] },
              ],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/1303515532835177?')) {
        return new Response(JSON.stringify({ id: '1303515532835177', name: 'Pagina Pruebas' }), { status: 200 });
      }
      if (url.includes('/me/businesses')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'biz-1',
                owned_pages: {
                  data: [
                    {
                      id: '1303515532835177',
                      name: 'Pagina Pruebas',
                      access_token: 'biz-page-token-456',
                      instagram_business_account: {
                        id: '17841416570135436',
                        username: 'tibs_pruebas',
                        name: 'TIBS Pruebas',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/subscribed_apps')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 400 });
    });

    const state = Buffer.from(
      JSON.stringify({ tenantSchema: validTenant, userId: validUserId, channel: 'instagram' }),
    ).toString('base64');

    const res = await service.handleCallback('oauth-code', state);

    expect(res.success).toBe(true);
    expect(savedConfig).toMatchObject({
      channel: 'instagram',
      accountId: '17841416570135436',
      name: '@tibs_pruebas',
      accessToken: 'biz-page-token-456',
    });
  });
});
