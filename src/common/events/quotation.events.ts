/**
 * Constantes de eventos para el módulo de cotizaciones PDF.
 * Usadas con EventEmitter2 para desacoplar dependencias circulares.
 */
export const QUOTATION_EVENTS = {
  /** Emitido por AiAgentService cuando necesita generar y enviar una cotización PDF */
  SEND_TO_CHANNEL: 'quotation.send_to_channel',
} as const;

export interface QuotationSendPayload {
  opportunityId: string;
  conversationId: string;
}
