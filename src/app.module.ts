import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { TiktokShopController } from './auth/tiktokshop.controller';
import { validateConfig } from './common/config';
import { HttpClientModule } from './common/http.module';
import { TiktokWebhookMiddleware } from './common/webhook.middleware';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { TiktokProductClient } from './catalog/tiktok-product.client';
import { VtexCatalogClient } from './catalog/vtex-catalog.client';
import { CategoryMappingService } from './catalog/category-mapping.service';
import { CategoryAiService } from './catalog/category-ai.service';
import { CatalogScheduler } from './catalog/catalog.scheduler';
import { ApiKeyAuthGuard } from './auth/auth.guard';
import { TiktokShopService } from './auth/tiktokshop.service';
import { TokenCryptoService } from './common/token-crypto.service';
import { InventoryService } from './inventory/inventory.service';
import { InventoryController } from './inventory/inventory.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { TiktokOrderClient } from './orders/tiktok-order.client';
import { VtexOrdersClient } from './orders/vtex-orders.client';
import { LogisticsService } from './logistics/logistics.service';
import { TiktokLogisticsClient } from './logistics/tiktok-logistics.client';
import { PrismaModule } from './prisma/prisma.module';
import { IdempotencyService } from './common/idempotency.service';
import { generateRequestId } from './common/utils';
import { ShopConfigService } from './common/shop-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate: validateConfig,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        serializers: {
          req: (req: any) => (req?.id ? { id: req.id } : undefined),
          res: () => undefined,
          err: (err: any) => ({
            type: err?.type,
            message: err?.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
          }),
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                },
              }
            : undefined,
        customProps: () => ({
          context: 'http',
        }),
        genReqId: (req) => req.headers['x-request-id']?.toString() ?? generateRequestId(),
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    HttpClientModule,
  ],
  controllers: [
    AppController,
    TiktokShopController,
    CatalogController,
    InventoryController,
    OrdersController,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    ApiKeyAuthGuard,
    TokenCryptoService,
    TiktokShopService,
    CatalogService,
    CategoryMappingService,
    CategoryAiService,
    CatalogScheduler,
    TiktokProductClient,
    VtexCatalogClient,
    InventoryService,
    OrdersService,
    TiktokOrderClient,
    VtexOrdersClient,
    LogisticsService,
    TiktokLogisticsClient,
    IdempotencyService,
    ShopConfigService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TiktokWebhookMiddleware).forRoutes('webhooks/tiktok/orders');
  }
}
