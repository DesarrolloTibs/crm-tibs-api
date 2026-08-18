import { Injectable, Logger, OnModuleInit, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AiAgentConfig } from '../conversations/entities/ai-agent-config.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { SubscriptionValidatorService } from '../subscriptions/subscription-validator.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Embeddings } from '@langchain/core/embeddings';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
const pdfParse = require('pdf-parse');

export class CustomWatsonxEmbeddings extends Embeddings {
  private iamToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    private readonly apiKey: string,
    private readonly projectId: string,
    private readonly region: string,
    private readonly modelId: string = 'ibm/slate-125m-english-rtrvr',
  ) {
    super({});
  }

  private async getIamToken(): Promise<string> {
    const now = Date.now();
    if (this.iamToken && now < this.tokenExpiry) {
      return this.iamToken;
    }

    const url = 'https://iam.cloud.ibm.com/identity/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
    params.append('apikey', this.apiKey);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`Error obteniendo IAM Token de IBM: status ${response.status}`);
    }

    const data: any = await response.json();
    this.iamToken = data.access_token;
    this.tokenExpiry = now + (data.expires_in - 60) * 1000;
    return this.iamToken!;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const token = await this.getIamToken();
    const rawRegion = this.region || 'us-south';
    const baseUrl = rawRegion.startsWith('http')
      ? rawRegion.replace(/\/$/, '')
      : `https://${rawRegion}.ml.cloud.ibm.com`;
    const url = `${baseUrl}/ml/v1/text/embeddings?version=2024-05-31`;

    const cleanDocs = documents
      .map(d => (d && d.trim().length > 0 ? d.trim() : ''))
      .filter(d => d.length > 0);

    if (cleanDocs.length === 0) {
      return [];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model_id: this.modelId,
        project_id: this.projectId,
        inputs: cleanDocs,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en API de IBM Watsonx Embeddings: status ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const results = data.results || data.embeddings || [];
    if (!results || results.length === 0) {
      throw new Error(`Respuesta inválida de IBM Watsonx Embeddings: ${JSON.stringify(data)}`);
    }

    return results.map((r: any) => r.embedding || r.results?.[0]?.embedding || r);
  }




  async embedQuery(document: string): Promise<number[]> {
    const embeddings = await this.embedDocuments([document]);
    return embeddings[0];
  }
}

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger('RagService');
  private readonly vectorStoresByTenant = new Map<string, PGVectorStore>();
  private currentApiKey: string | null = null;
  private currentProvider: string | null = null;
  private currentEmbeddingModel: string | null = null;

  constructor(
    @InjectRepository(AiAgentConfig)
    private readonly aiAgentConfigRepository: Repository<AiAgentConfig>,
    private readonly configService: ConfigService,
    private readonly subscriptionValidator: SubscriptionValidatorService,
  ) {}

  async onModuleInit() {
    try {
      await this.initializeVectorStore();
    } catch (error) {
      this.logger.error('Error al inicializar el almacenamiento vectorial:', error);
    }
  }

  /**
   * Inicializa la base de datos vectorial de pgvector aislada por tenantSchema en Supabase.
   */
  private async initializeVectorStore(): Promise<PGVectorStore> {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';

    const config = await this.getAgentConfig();

    const watsonKey = config.watsonxApiKey || process.env.WATSONX_API_KEY;
    const watsonProject = config.watsonxProjectId || process.env.WATSONX_PROJECT_ID;
    const openAiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

    let provider = config.modelProvider;

    // Si el proveedor no fue definido en la BD o el seleccionado carece de credenciales,
    // seleccionar automáticamente el proveedor que SÍ tiene credenciales guardadas en la BD:
    if (
      !provider ||
      (provider === 'gemini' && !geminiKey) ||
      (provider === 'openai' && !openAiKey) ||
      (provider === 'watsonx' && (!watsonKey || !watsonProject))
    ) {
      if (watsonKey && watsonProject) {
        provider = 'watsonx';
      } else if (openAiKey) {
        provider = 'openai';
      } else if (geminiKey) {
        provider = 'gemini';
      } else {
        provider = 'watsonx';
      }
    }

    let embeddings: any;

    if (provider === 'openai' && openAiKey) {
      const endpoint = config.openaiEndpoint || process.env.OPENAI_ENDPOINT || null;
      if (endpoint) {
        const deploymentName = config.openaiEmbeddingModel || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
        this.currentEmbeddingModel = deploymentName;
        embeddings = new OpenAIEmbeddings({
          modelName: deploymentName,
          openAIApiKey: openAiKey,
          configuration: {
            baseURL: `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}`,
            defaultQuery: { 'api-version': config.openaiApiVersion || '2023-05-15' },
            defaultHeaders: { 'api-key': openAiKey },
          }
        });
      } else {
        const standardModel = config.openaiEmbeddingModel || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
        this.currentEmbeddingModel = standardModel;
        embeddings = new OpenAIEmbeddings({ openAIApiKey: openAiKey, modelName: standardModel });
      }
      this.currentApiKey = openAiKey;
    } else if (provider === 'watsonx' && watsonKey && watsonProject) {
      const region = config.watsonxRegion || process.env.WATSONX_REGION || 'us-south';
      const embeddingModel = config.watsonxEmbeddingModel || process.env.WATSONX_EMBEDDING_MODEL || 'ibm/slate-125m-english-rtrvr';
      this.currentEmbeddingModel = embeddingModel;
      embeddings = new CustomWatsonxEmbeddings(watsonKey, watsonProject, region, embeddingModel);
      this.currentApiKey = watsonKey;
    } else if (geminiKey) {
      const standardModel = 'text-embedding-004';
      this.currentEmbeddingModel = standardModel;
      embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: geminiKey,
        modelName: standardModel,
      });
      this.currentApiKey = geminiKey;
    } else {
      throw new Error('No se encontraron credenciales de IA configuradas en la base de datos para ninguno de los proveedores (IBM WatsonX, OpenAI o Gemini).');
    }


    if (
      this.currentProvider !== provider ||
      (provider === 'gemini' && config.geminiApiKey !== this.currentApiKey) ||
      (provider === 'openai' && (config.openaiApiKey !== this.currentApiKey || config.openaiEmbeddingModel !== this.currentEmbeddingModel)) ||
      (provider === 'watsonx' && (config.watsonxApiKey !== this.currentApiKey || config.watsonxEmbeddingModel !== this.currentEmbeddingModel))
    ) {
      this.vectorStoresByTenant.clear();
    }

    this.currentProvider = provider;

    if (this.vectorStoresByTenant.has(tenantSchema)) {
      return this.vectorStoresByTenant.get(tenantSchema)!;
    }

    // Configuración de la conexión usando el Pooler IPv4 de Supabase mapeado en .env y search_path por tenant
    const dbHost = this.configService.get<string>('DB_HOST');
    const dbPort = this.configService.get<number>('DB_PORT', 5432);
    const dbUser = this.configService.get<string>('DB_USERNAME');
    const dbPass = this.configService.get<string>('DB_PASSWORD');
    const dbName = this.configService.get<string>('DB_DATABASE');

    // Asegurar que la extensión pgvector esté activada en el esquema public de Supabase antes de inicializar la tabla
    try {
      await this.aiAgentConfigRepository.manager.query(`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;`);
      await this.aiAgentConfigRepository.manager.query(`GRANT USAGE ON SCHEMA public TO PUBLIC;`);
    } catch (err) {
      this.logger.warn(`No se pudo verificar la extensión vector: ${err.message}`);
    }



    const connectionString = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}?options=-c%20search_path%3D${tenantSchema}%2Cpublic`;


    const store = await PGVectorStore.initialize(embeddings, {

      postgresConnectionOptions: {
        connectionString,
      },
      tableName: 'product_knowledge_base',
      columns: {
        idColumnName: 'id',
        contentColumnName: 'content',
        vectorColumnName: 'embedding',
        metadataColumnName: 'metadata',
      },
    });


    this.vectorStoresByTenant.set(tenantSchema, store);
    this.logger.log(`Base de datos vectorial pgvector inicializada con éxito para el esquema ${tenantSchema}.`);
    return store;
  }


  /**
   * Recibe el buffer de un archivo PDF, extrae su texto, lo segmenta y genera embeddings.
   */
  async ingestPdf(fileBuffer: Buffer, fileName: string, productKey: string): Promise<number> {
    // ── Pre-validación de suscripción (solo esquemas tenant) ──
    const activeSchema = TenantContextService.getTenantSchema();
    if (activeSchema && activeSchema !== 'public') {
      await this.subscriptionValidator.checkSubscriptionLimits(activeSchema);
    }

    const store = await this.initializeVectorStore();

    // 1. Extraer texto del PDF utilizando la clase PDFParse (pdf-parse v2)
    const { PDFParse } = pdfParse;
    if (!PDFParse) {
      throw new Error('La clase PDFParse no se encuentra exportada en la librería pdf-parse.');
    }

    let fullText = '';
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const result = await parser.getText();
      fullText = result.text;
    } finally {
      // Liberar recursos de PDF.js para prevenir fugas de memoria
      await parser.destroy().catch((err: any) => {
        this.logger.warn(`No se pudo destruir el parser de PDF de forma limpia: ${err.message}`);
      });
    }

    if (!fullText || fullText.trim().length === 0) {
      throw new Error('El PDF no contiene texto legible.');
    }

    // 2. Particionar el texto en chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(fullText);

    // 3. Crear formato de Documentos de LangChain
    const documents = chunks.map((chunk: string, index: number) => ({
      pageContent: chunk,
      metadata: {
        source: fileName,
        product: productKey,
        chunkIndex: index,
      },
    }));

    // 4. Guardar embeddings en pgvector
    await store.addDocuments(documents);
    this.logger.log(`Ingestados con éxito ${documents.length} fragmentos de '${fileName}' para el producto '${productKey}'.`);
    
    return documents.length;
  }

  /**
   * Busca fragmentos similares a la query utilizando filtros por metadata de producto.
   */
  async searchSimilar(query: string, limit: number = 3, productKey?: string): Promise<any[]> {
    if (!query || query.trim() === '') {
      return [];
    }

    // ── Pre-validación de suscripción (solo esquemas tenant) ──
    const activeSchema = TenantContextService.getTenantSchema();
    if (activeSchema && activeSchema !== 'public') {
      await this.subscriptionValidator.checkSubscriptionLimits(activeSchema);
    }

    const store = await this.initializeVectorStore();
    
    // Si cambia la API Key o el proveedor en caliente, reinicializamos la conexión
    const config = await this.getAgentConfig();
    if (config.modelProvider !== this.currentProvider || 
        (config.modelProvider === 'gemini' && config.geminiApiKey !== this.currentApiKey) ||
        (config.modelProvider === 'openai' && (config.openaiApiKey !== this.currentApiKey || config.openaiEmbeddingModel !== this.currentEmbeddingModel)) ||
        (config.modelProvider === 'watsonx' && (config.watsonxApiKey !== this.currentApiKey || config.watsonxEmbeddingModel !== this.currentEmbeddingModel))) {
      this.vectorStoresByTenant.clear();
      await this.initializeVectorStore();
    }


    // Ejecutar búsqueda por similitud con filtro por metadata si aplica
    const results = await store.similaritySearch(
      query,
      limit,
      productKey ? { product: productKey } : undefined
    );

    return results.map(doc => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata
    }));
  }

  /**
   * Obtiene la configuración del Agente.
   */
  private async getAgentConfig(): Promise<Partial<AiAgentConfig>> {
    // 1. Cargar credenciales globales desde el esquema public (public.ai_agent_configs)
    try {
      const publicConfigs = await this.aiAgentConfigRepository.manager.query(
        `SELECT id, "modelProvider", "geminiApiKey", "openaiApiKey", "openaiEndpoint", "openaiApiVersion", "openaiEmbeddingModel", "watsonxApiKey", "watsonxProjectId", "watsonxRegion", "watsonxEmbeddingModel" FROM public.ai_agent_configs LIMIT 1`
      );
      if (publicConfigs && publicConfigs.length > 0) {
        const c = publicConfigs[0];
        if (c.watsonxApiKey || c.openaiApiKey || c.geminiApiKey) {
          return c;
        }
      }
    } catch (e) {
      this.logger.warn(`No se pudieron cargar credenciales de public.ai_agent_configs: ${e.message}`);
    }

    // 2. Buscar en la tabla del esquema local
    try {
      let config = await this.aiAgentConfigRepository.findOne({ where: {} });
      if (config && (config.watsonxApiKey || config.openaiApiKey || config.geminiApiKey)) {
        return config;
      }
    } catch (e) {}

    // 3. Fallback de variables de entorno
    return {
      modelProvider: (process.env.MODEL_PROVIDER as any) || 'watsonx',
      geminiApiKey: process.env.GEMINI_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      watsonxApiKey: process.env.WATSONX_API_KEY,
      watsonxProjectId: process.env.WATSONX_PROJECT_ID,
      watsonxRegion: process.env.WATSONX_REGION || 'us-south',
    };
  }



  /**
   * Genera un embedding para un producto del catálogo (nombre y descripción) e indexa su metadata
   * en la base de datos vectorial para permitir búsquedas semánticas precisas.
   */
  async ingestProduct(
    productId: string,
    nombre: string,
    descripcion: string | null,
    precioBase?: number | null,
    unidadMedida?: string,
    observaciones?: string | null,
  ): Promise<void> {
    try {
      // ── Pre-validación de suscripción (solo esquemas tenant) ──
      const activeSchema = TenantContextService.getTenantSchema();
      if (activeSchema && activeSchema !== 'public') {
        await this.subscriptionValidator.checkSubscriptionLimits(activeSchema);
      }

      const store = await this.initializeVectorStore();

      // Generar la llave única del producto (slug)
      const productKey = nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      // 1. Eliminar embeddings previos de este producto para evitar duplicaciones
      await this.aiAgentConfigRepository.manager.query(
        "DELETE FROM product_knowledge_base WHERE metadata->>'productId' = $1 OR metadata->>'product' = $2",
        [productId, productKey]
      );

      // 2. Construir el texto del catálogo estructurado con todos los atributos clave
      const unidadText = unidadMedida || 'Pieza';
      const precioText = precioBase !== undefined && precioBase !== null ? `$${precioBase} MXN por ${unidadText}` : `Por definir por ${unidadText}`;
      const obsText = observaciones && observaciones.trim() ? observaciones.trim() : 'Sin observaciones / notas adicionales';
      const contentText = `Producto: ${nombre}\nPrecio Base: ${precioText}\nUnidad de Medida: ${unidadText}\nObservaciones / Notas de Cotización (MENCIONAR OBLIGATORIAMENTE AL CLIENTE): ${obsText}\nDescripción: ${descripcion || 'Sin descripción'}`;

      // 3. Crear el formato de documento de LangChain
      const document = {
        pageContent: contentText,
        metadata: {
          source: 'database-catalog',
          product: productKey,
          productId: productId,
        },
      };

      // 4. Guardar en pgvector
      await store.addDocuments([document]);
      this.logger.log(`Catálogo indexado en RAG: '${nombre}' (${productKey})`);
    } catch (error: any) {
      this.logger.error(`Error al indexar producto '${nombre}' en RAG: ${error.message}`);
    }
  }

  /**
   * Elimina los embeddings asociados a un producto específico del RAG pgvector.
   */
  async deleteProduct(productId: string): Promise<void> {
    try {
      await this.initializeVectorStore();
      await this.aiAgentConfigRepository.manager.query(
        "DELETE FROM product_knowledge_base WHERE metadata->>'productId' = $1",
        [productId]
      );
      this.logger.log(`Producto eliminado de RAG: '${productId}'`);
    } catch (error: any) {
      this.logger.error(`Error al eliminar producto '${productId}' de RAG: ${error.message}`);
    }
  }
}
