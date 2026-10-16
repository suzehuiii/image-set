import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

import type { OperationalRequest } from './operational.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<OperationalRequest>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const exceptionBody =
      typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    const rawMessage =
      typeof body === 'object' && body && 'message' in body
        ? (body as { message: string | string[] }).message
        : 'Internal server error';
    response.status(status).json({
      code:
        typeof exceptionBody.code === 'string'
          ? exceptionBody.code
          : `HTTP_${status}`,
      message: Array.isArray(rawMessage) ? rawMessage.join('; ') : rawMessage,
      requestId: request.requestId ?? randomUUID(),
      ...(exceptionBody.details ? { details: exceptionBody.details } : {}),
    });
  }
}
