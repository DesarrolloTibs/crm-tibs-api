/**
 * Constantes de eventos para el módulo de conversaciones.
 * Usadas con EventEmitter2 para desacoplar dependencias circulares.
 */
export const CONVERSATION_EVENTS = {
  /** Emitido por AiAgentService/ConversationsService cuando se debe emitir por WebSocket */
  EMIT_MESSAGE: 'conversation.emit_message',
  /** Emitido cuando se actualiza el consumo de un tenant */
  TENANT_CONSUMPTION_UPDATED: 'conversation.tenant_consumption_updated',
  /** Emitido cuando se necesita enviar un documento a un canal externo */
  SEND_DOCUMENT_TO_CHANNEL: 'conversation.send_document_to_channel',
} as const;
