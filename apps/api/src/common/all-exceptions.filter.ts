import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import type { Response } from 'express';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_SUPPORTED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_CONTENT',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Catches errors thrown outside oRPC handlers (unknown routes, guards, middleware) and answers
 * in the same `{ code, status, message }` shape oRPC uses, so clients handle one error format.
 * Errors inside contract handlers are serialized by oRPC itself and never reach this filter.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const message =
      status >= 500
        ? 'Something went wrong on our side.'
        : exception instanceof HttpException
          ? exception.message
          : 'Request failed.';

    response.status(status).json({
      defined: false,
      code: CODE_BY_STATUS[status] ?? 'UNKNOWN',
      status,
      message,
    });
  }
}
