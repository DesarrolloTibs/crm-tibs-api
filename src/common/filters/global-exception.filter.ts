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
    if (host.getType() !== 'http') {
      const msg = exception instanceof Error ? exception.message : String(exception);
      this.logger.error(`[${host.getType().toUpperCase()}] Excepción no HTTP: ${msg}`);
      return;
    }

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
      const driverError = (exception as any).driverError || exception;
      const pgCode = driverError?.code as string | undefined;
      const isProd = process.env.NODE_ENV === 'production';
      const detail = !isProd ? (driverError?.detail as string | undefined) : undefined;

      switch (pgCode) {
        case '23505':
          statusCode = HttpStatus.CONFLICT;
          message = detail ?? 'Ya existe un registro con los mismos datos únicos.';
          break;
        case '23503':
          statusCode = HttpStatus.BAD_REQUEST;
          message = detail ?? 'La referencia relacionada no existe o está en uso.';
          break;
        case '23502':
          statusCode = HttpStatus.BAD_REQUEST;
          message = detail ?? 'Falta un campo obligatorio requerido por la base de datos.';
          break;
        case '22001':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Uno de los campos excede la longitud máxima permitida.';
          break;
        case '22003':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Uno de los valores numéricos excede el rango permitido.';
          break;
        case '22P02':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Formato de identificador o tipo de dato inválido.';
          break;
        default:
          statusCode = HttpStatus.BAD_REQUEST;
          message = detail ?? 'Error en la consulta a la base de datos.';
          break;
      }
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
