import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * Custom NestJS logger that outputs structured JSON in production and
 * human-readable format in development. Drop-in replacement for NestJS's
 * built-in logger — registered once via `app.useLogger()` in `main.ts`.
 */
export class NestAppLogger extends ConsoleLogger {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  private buildMessage(level: string, message: any, context?: string): string {
    if (this.isProduction) {
      return JSON.stringify({
        level,
        timestamp: new Date().toISOString(),
        context: context || this.context || 'Application',
        message: message instanceof Error ? message.message : String(message),
        ...(message instanceof Error && message.stack ? { stack: message.stack } : {}),
      });
    }
    const ts = new Date().toISOString();
    const ctx = context || this.context || 'Application';
    return `[${ts}] ${level.toUpperCase().padEnd(5)} [${ctx}] ${message}`;
  }

  log(message: any, context?: string): void {
    super.log(this.buildMessage('info', message, context), context);
  }

  error(message: any, stack?: string, context?: string): void {
    if (this.isProduction) {
      process.stderr.write(
        JSON.stringify({
          level: 'error',
          timestamp: new Date().toISOString(),
          context: context || this.context || 'Application',
          message: message instanceof Error ? message.message : String(message),
          stack: stack || (message instanceof Error ? message.stack : undefined),
        }) + '\n',
      );
    } else {
      super.error(this.buildMessage('error', message, context));
    }
  }

  warn(message: any, context?: string): void {
    super.warn(this.buildMessage('warn', message, context), context);
  }

  debug(message: any, context?: string): void {
    super.debug(this.buildMessage('debug', message, context), context);
  }

  verbose(message: any, context?: string): void {
    super.verbose(this.buildMessage('verbose', message, context), context);
  }

  /**
   * Returns the log levels enabled based on NODE_ENV.
   * Production: log, error, warn. Development: all levels.
   */
  static getLogLevels(): LogLevel[] {
    if (process.env.NODE_ENV === 'production') {
      return ['log', 'error', 'warn'];
    }
    return ['log', 'error', 'warn', 'debug', 'verbose'];
  }
}
