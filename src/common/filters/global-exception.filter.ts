import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

/**
 * Filtro global de excepciones.
 * Captura cualquier error no controlado y devuelve una respuesta JSON estandarizada.
 * En producción omite el stack trace para evitar filtración de información interna.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor.';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message ?? message;
    } else if (exception instanceof TokenExpiredError) {
      statusCode = HttpStatus.UNAUTHORIZED;
      message = 'Token de sesión expirado.';
    } else if (exception instanceof JsonWebTokenError) {
      statusCode = HttpStatus.UNAUTHORIZED;
      message = 'Token de sesión inválido.';
    } else if (exception instanceof QueryFailedError) {
      statusCode = HttpStatus.BAD_REQUEST;
      // Exponer solo el constraint, no el SQL completo
      const detail = (exception as any).detail as string | undefined;
      message = detail ?? 'Error en la consulta a la base de datos.';
    }

    const stack = process.env.NODE_ENV !== 'production'
      ? (exception instanceof Error ? exception.stack : String(exception))
      : undefined;

    if (statusCode >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} → ${statusCode}: ${JSON.stringify(message)}`);
    }

    const body: Record<string, unknown> = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (stack) {
      body.stack = stack;
    }

    response.status(statusCode).json(body);
  }
}
