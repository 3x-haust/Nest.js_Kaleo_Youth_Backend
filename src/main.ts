import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Response } from 'express';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/constants';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 쿠키 인증이므로 프론트 오리진을 화이트리스트로만 허용합니다.
    cors: false,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 4000;
  const trustProxyHops = config.get<number>('trustProxyHops') ?? 0;
  const corsOrigins = config.get<string[]>('corsOrigins') ?? [];
  const uploadDir = config.get<string>('upload.dir') ?? './uploads';

  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.use(
    helmet({
      // 업로드 이미지를 다른 오리진(프론트)에서 <img>로 불러올 수 있어야 합니다.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const absoluteUploadDir = resolve(process.cwd(), uploadDir);
  mkdirSync(absoluteUploadDir, { recursive: true });
  app.useStaticAssets(absoluteUploadDir, {
    prefix: '/uploads/',
    // 업로드 파일이 HTML로 해석돼 실행되는 것을 막습니다.
    setHeaders: (res: Response) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);

  console.log(`KALEO YOUTH API → http://localhost:${port}/${API_PREFIX}`);
}

void bootstrap();
