import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * Custom NestJS logger that outputs structured JSON in production and
 * human-readable format in development. Drop-in replacement for NestJS's
 * built-in logger — registered once via `app.useLogger()` in `main.ts`.
 */
export class NestAppLogger extends ConsoleLogger {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  private printJson(level: string, message: any, ...optionalParams: any[]) {
    const context = optionalParams[optionalParams.length - 1];
    const stack = level === 'error' && optionalParams.length > 1 ? optionalParams[0] : undefined;
    
    const logObj: any = {
      level,
      timestamp: new Date().toISOString(),
      context: typeof context === 'string' ? context : this.context || 'Application',
      message: message instanceof Error ? message.message : String(message),
    };
    
    if (stack || (message instanceof Error && message.stack)) {
      logObj.stack = stack || message.stack;
    }
    
    const output = JSON.stringify(logObj) + '\n';
    if (level === 'error' || level === 'warn') {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  }

  log(message: any, ...optionalParams: any[]): void {
    if (this.isProduction) {
      this.printJson('info', message, ...optionalParams);
    } else {
      super.log(message, ...optionalParams);
    }
  }

  error(message: any, ...optionalParams: any[]): void {
    if (this.isProduction) {
      this.printJson('error', message, ...optionalParams);
    } else {
      super.error(message, ...optionalParams);
    }
  }

  warn(message: any, ...optionalParams: any[]): void {
    if (this.isProduction) {
      this.printJson('warn', message, ...optionalParams);
    } else {
      super.warn(message, ...optionalParams);
    }
  }

  debug(message: any, ...optionalParams: any[]): void {
    if (this.isProduction) {
      this.printJson('debug', message, ...optionalParams);
    } else {
      super.debug(message, ...optionalParams);
    }
  }

  verbose(message: any, ...optionalParams: any[]): void {
    if (this.isProduction) {
      this.printJson('verbose', message, ...optionalParams);
    } else {
      super.verbose(message, ...optionalParams);
    }
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
