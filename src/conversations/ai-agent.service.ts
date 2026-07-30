import { Injectable, OnModuleInit } from '@nestjs/common';
import { Conversation } from './entities/conversation.entity';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiSubAgent } from './entities/ai-sub-agent.entity';
import { AiAgentOrchestratorService, AgentStateAnnotation, AgentState } from './ai-agent-orchestrator.service';
import { AiSubAgentMigrationService } from './ai-sub-agent-migration.service';
import { AiAgentToolsHandlerService } from './ai-agent-tools-handler.service';

// Re-export types consumed by other modules (WebchatService, etc.)
export type { AgentState };
export { AgentStateAnnotation };

/**
 * Facade for the AI Agent subsystem.
 *
 * Preserves the exact same public API that all other services depend on
 * (ConversationsController, WebchatService, ConversationsGateway) while
 * delegating every responsibility to the specialized services:
 *
 *   - AiAgentOrchestratorService  → LangGraph, LLM calls, config, sub-agents
 *   - AiAgentToolsHandlerService  → CRM tool execution, Cube.dev, RAG
 *   - AiSubAgentMigrationService  → onModuleInit seeding
 *
 * @see AiAgentOrchestratorService
 * @see AiAgentToolsHandlerService
 * @see AiSubAgentMigrationService
 */
@Injectable()
export class AiAgentService implements OnModuleInit {

  constructor(
    private readonly orchestrator: AiAgentOrchestratorService,
    private readonly migrationService: AiSubAgentMigrationService,
    private readonly toolsHandler: AiAgentToolsHandlerService,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.migrationService.onModuleInit();
  }

  // ── Core conversation processing ────────────────────────────────────────

  async processIncomingMessage(
    conversation: Conversation,
    incomingContent: string,
  ): Promise<{ reply: string; route: string; isHandedOff: boolean }> {
    return this.orchestrator.processIncomingMessage(conversation, incomingContent);
  }

  // ── Config management ───────────────────────────────────────────────────

  async getOrInitConfig(): Promise<AiAgentConfig> {
    return this.orchestrator.getOrInitConfig();
  }

  async saveConfig(data: Partial<AiAgentConfig>): Promise<AiAgentConfig> {
    return this.orchestrator.saveConfig(data);
  }

  // ── Sub-agent management ────────────────────────────────────────────────

  async getSubAgents(): Promise<AiSubAgent[]> {
    return this.orchestrator.getSubAgents();
  }

  async saveSubAgent(data: any): Promise<AiSubAgent> {
    return this.orchestrator.saveSubAgent(data);
  }

  async deleteSubAgent(id: string): Promise<void> {
    return this.orchestrator.deleteSubAgent(id);
  }

  // ── Public helpers used by external modules ─────────────────────────────

  /** Invokes the LLM with the active config. Used by WebchatService. */
  async invokeLanguageModel(prompt: string, temperatureOverride?: number): Promise<string> {
    const config = await this.orchestrator.getOrInitConfig();
    return this.orchestrator.callLLM(config, prompt, temperatureOverride);
  }

  /** Sanitizes LLM JSON output. Used by WebchatService. */
  sanitizeJsonOutput(text: string): string {
    return this.orchestrator.cleanJsonOutput(text);
  }

  /** Returns a signed Cube.dev JWT for the current tenant. */
  getCubeApiToken(tenantSchemaOverride?: string): string {
    return this.toolsHandler['generateCubeToken'](tenantSchemaOverride);
  }

  /** Syncs existing product PDF files to the RAG vector store. */
  async syncExistingProductFilesToRag(): Promise<void> {
    return this.toolsHandler.syncExistingProductFilesToRag();
  }

  /** Syncs all active catalogue products to the RAG vector store. */
  async syncCatalogProductsToRag(): Promise<void> {
    return this.toolsHandler.syncCatalogProductsToRag();
  }
}
