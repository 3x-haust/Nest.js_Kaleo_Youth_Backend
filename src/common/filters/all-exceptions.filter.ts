import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * 예기치 못한 예외의 내부 정보(스택, DB 오류 문구)가 응답으로 새어 나가지 않게 막습니다.
 * 상세 내용은 서버 로그에만 남깁니다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : { statusCode: status, ...body },
        );
      return;
    }

    this.logger.error(
      `${request.method} ${request.originalUrl} 처리 중 예외`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
    });
  }
}
