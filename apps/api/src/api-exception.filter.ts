import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const rawMessage =
      typeof body === 'object' && body && 'message' in body
        ? (body as { message: string | string[] }).message
        : 'Internal server error';
    response.status(status).json({
      code: `HTTP_${status}`,
      message: Array.isArray(rawMessage) ? rawMessage.join('; ') : rawMessage,
      requestId: request.header('x-request-id') ?? randomUUID(),
    });
  }
}
