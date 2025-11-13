import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AppConfig } from './common/config';
import { generateRequestId } from './common/utils';
import { RequestContextService } from './common/request-context.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService<AppConfig>);
  const requestContext = app.get(RequestContextService);

  app.use(helmet());
  app.use(
    json({
      verify: (req: any, _res, buffer) => {
        req.rawBody = buffer;
      },
    }),
  );
  app.use(
    urlencoded({
      extended: true,
    }),
  );

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();
    req.headers['x-request-id'] = requestId;
    requestContext.runWithRequestId(requestId, () => next());
  });

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  setupSwagger(app, configService);

  const port = configService.get<number>('PORT', { infer: true }) ?? 3000;
  await app.listen(port, '0.0.0.0');
}

function setupSwagger(app: any, configService: ConfigService<AppConfig>) {
  const username = configService.getOrThrow<string>('SWAGGER_USERNAME', { infer: true });
  const password = configService.getOrThrow<string>('SWAGGER_PASSWORD', { infer: true });
  const isProduction =
    configService.getOrThrow<string>('NODE_ENV', { infer: true }) === 'production';

  const config = new DocumentBuilder()
    .setTitle('VTEX ↔ TikTok Shop Middleware')
    .setDescription('APIs internas de sincronização e webhooks')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Chave interna do middleware para rotas protegidas',
      },
      'middlewareApiKey',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  if (isProduction) {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use('/docs', (req: Request, res: Response, next: NextFunction) => {
      const header = req.headers.authorization;
      if (!header) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required');
      }

      const [scheme, encoded] = header.split(' ');
      if (scheme !== 'Basic' || !encoded) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required');
      }

      const [providedUser, providedPass] = Buffer.from(encoded, 'base64')
        .toString('utf8')
        .split(':');

      if (providedUser !== username || providedPass !== password) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Invalid credentials');
      }

      return next();
    });
  }

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}

bootstrap();
