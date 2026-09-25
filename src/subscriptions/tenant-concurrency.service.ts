import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

interface QueuedTask {
  resolve: (release: () => void) => void;
  reject: (err: any) => void;
  timeoutId?: NodeJS.Timeout;
}

interface TenantQueueState {
  activeCount: number;
  maxConcurrent: number;
  waiting: QueuedTask[];
}

@Injectable()
export class TenantConcurrencyService {
  private readonly logger = new Logger(TenantConcurrencyService.name);
  private readonly tenantQueues = new Map<string, TenantQueueState>();

  private getOrCreateQueue(schemaName: string, maxConcurrent = 2): TenantQueueState {
    let state = this.tenantQueues.get(schemaName);
    if (!state) {
      state = {
        activeCount: 0,
        maxConcurrent,
        waiting: [],
      };
      this.tenantQueues.set(schemaName, state);
    }
    return state;
  }

  /**
   * Ejecuta una tarea protegida bajo el semáforo de concurrencia del tenant.
   * - Permite hasta maxConcurrent llamadas simultáneas activas al LLM por tenant (por defecto 2).
   * - Cola de espera ilimitada (FIFO) para no rechazar peticiones legítimas concurrentes.
   * - Purga instantánea ("Circuit Breaker"): Si la tarea falla por límite de tokens (HTTP 402),
   *   cancela y rechaza inmediatamente todas las peticiones encoladas para no hacerlas esperar en vano.
   */
  async runWithSlot<T>(
    schemaName: string,
    task: () => Promise<T>,
    maxConcurrent: number = 2,
    timeoutMs: number = 60000 // 60 segundos de protección contra llamadas colgadas
  ): Promise<T> {
    // Para el esquema 'public' o llamadas globales, no se aplican restricciones de concurrencia de tenant
    if (!schemaName || schemaName === 'public') {
      return task();
    }

    const release = await this.acquireSlot(schemaName, maxConcurrent, timeoutMs);

    try {
      const result = await task();
      return result;
    } catch (error: any) {
      // Circuit Breaker: si se detecta agotamiento de tokens (HTTP 402 TOKENS_LIMIT_EXCEEDED o EXTRA_TOKENS_LIMIT_EXCEEDED),
      // purgar inmediatamente toda la cola de espera de este tenant.
      if (this.isQuotaExceededError(error)) {
        this.purgeTenantQueue(schemaName, error);
      }
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Detecta si un error corresponde a agotamiento de cuota de suscripción (HTTP 402)
   */
  private isQuotaExceededError(error: any): boolean {
    if (error instanceof HttpException && error.getStatus() === HttpStatus.PAYMENT_REQUIRED) {
      return true;
    }
    const code = error?.response?.code || error?.code;
    return code === 'TOKENS_LIMIT_EXCEEDED' || code === 'EXTRA_TOKENS_LIMIT_EXCEEDED' || code === 'SUBSCRIPTION_EXPIRED';
  }

  /**
   * Purga y cancela de golpe todas las peticiones esperando en la cola del tenant
   */
  purgeTenantQueue(schemaName: string, error: any): void {
    const state = this.tenantQueues.get(schemaName);
    if (!state || state.waiting.length === 0) {
      return;
    }

    const count = state.waiting.length;
    this.logger.warn(`[Concurrency] Circuit Breaker: Purgando ${count} peticiones en cola para '${schemaName}' por límite de cuota.`);

    const tasksToReject = [...state.waiting];
    state.waiting = [];

    for (const task of tasksToReject) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
      task.reject(error);
    }
  }

  /**
   * Adquiere un slot para el tenant o se encola en espera de liberación
   */
  private acquireSlot(schemaName: string, maxConcurrent: number, timeoutMs: number): Promise<() => void> {
    const state = this.getOrCreateQueue(schemaName, maxConcurrent);

    return new Promise<() => void>((resolve, reject) => {
      const release = () => {
        state.activeCount--;

        if (state.waiting.length > 0) {
          const nextTask = state.waiting.shift()!;
          if (nextTask.timeoutId) {
            clearTimeout(nextTask.timeoutId);
          }
          state.activeCount++;
          nextTask.resolve(release);
        } else if (state.activeCount === 0) {
          this.tenantQueues.delete(schemaName);
        }
      };

      if (state.activeCount < state.maxConcurrent) {
        state.activeCount++;
        resolve(release);
      } else {
        // Encolar sin límite de tamaño (cola ilimitada)
        let timeoutId: NodeJS.Timeout | undefined;
        if (timeoutMs > 0) {
          timeoutId = setTimeout(() => {
            const index = state.waiting.findIndex((t) => t.timeoutId === timeoutId);
            if (index !== -1) {
              state.waiting.splice(index, 1);
              reject(new HttpException('Tiempo de espera excedido para procesar consulta de IA en cola.', HttpStatus.REQUEST_TIMEOUT));
            }
          }, timeoutMs);
        }

        state.waiting.push({ resolve, reject, timeoutId });
        this.logger.debug(`[Concurrency] Petición encolada para tenant '${schemaName}'. En espera: ${state.waiting.length}, Activas: ${state.activeCount}`);
      }
    });
  }

  /**
   * Consulta el estado del semáforo para monitoreo o auditoría
   */
  getTenantConcurrencyStatus(schemaName: string) {
    const state = this.tenantQueues.get(schemaName);
    return {
      schemaName,
      activeCalls: state?.activeCount || 0,
      waitingQueue: state?.waiting.length || 0,
    };
  }
}
