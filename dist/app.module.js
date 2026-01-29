"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const throttler_1 = require("@nestjs/throttler");
const nestjs_pino_1 = require("nestjs-pino");
const core_1 = require("@nestjs/core");
const throttler_2 = require("@nestjs/throttler");
const app_controller_1 = require("./app.controller");
const tiktokshop_controller_1 = require("./auth/tiktokshop.controller");
const config_2 = require("./common/config");
const http_module_1 = require("./common/http.module");
const webhook_middleware_1 = require("./common/webhook.middleware");
const catalog_controller_1 = require("./catalog/catalog.controller");
const catalog_service_1 = require("./catalog/catalog.service");
const tiktok_product_client_1 = require("./catalog/tiktok-product.client");
const vtex_catalog_client_1 = require("./catalog/vtex-catalog.client");
const category_mapping_service_1 = require("./catalog/category-mapping.service");
const category_ai_service_1 = require("./catalog/category-ai.service");
const catalog_scheduler_1 = require("./catalog/catalog.scheduler");
const auth_guard_1 = require("./auth/auth.guard");
const tiktokshop_service_1 = require("./auth/tiktokshop.service");
const token_crypto_service_1 = require("./common/token-crypto.service");
const inventory_service_1 = require("./inventory/inventory.service");
const inventory_controller_1 = require("./inventory/inventory.controller");
const orders_controller_1 = require("./orders/orders.controller");
const orders_service_1 = require("./orders/orders.service");
const orders_scheduler_1 = require("./orders/orders.scheduler");
const tiktok_order_client_1 = require("./orders/tiktok-order.client");
const vtex_orders_client_1 = require("./orders/vtex-orders.client");
const logistics_service_1 = require("./logistics/logistics.service");
const tiktok_logistics_client_1 = require("./logistics/tiktok-logistics.client");
const prisma_module_1 = require("./prisma/prisma.module");
const idempotency_service_1 = require("./common/idempotency.service");
const utils_1 = require("./common/utils");
const shop_config_service_1 = require("./common/shop-config.service");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(webhook_middleware_1.TiktokWebhookMiddleware).forRoutes('webhooks/tiktok/orders');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                cache: true,
                expandVariables: true,
                validate: config_2.validateConfig,
            }),
            nestjs_pino_1.LoggerModule.forRoot({
                pinoHttp: {
                    serializers: {
                        req: (req) => (req?.id ? { id: req.id } : undefined),
                        res: () => undefined,
                        err: (err) => ({
                            type: err?.type,
                            message: err?.message,
                            stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
                        }),
                    },
                    transport: process.env.NODE_ENV !== 'production'
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
                    genReqId: (req) => req.headers['x-request-id']?.toString() ?? (0, utils_1.generateRequestId)(),
                },
            }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60_000,
                    limit: 100,
                },
            ]),
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            http_module_1.HttpClientModule,
        ],
        controllers: [
            app_controller_1.AppController,
            tiktokshop_controller_1.TiktokShopController,
            catalog_controller_1.CatalogController,
            inventory_controller_1.InventoryController,
            orders_controller_1.OrdersController,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_2.ThrottlerGuard,
            },
            auth_guard_1.ApiKeyAuthGuard,
            token_crypto_service_1.TokenCryptoService,
            tiktokshop_service_1.TiktokShopService,
            catalog_service_1.CatalogService,
            category_mapping_service_1.CategoryMappingService,
            category_ai_service_1.CategoryAiService,
            catalog_scheduler_1.CatalogScheduler,
            tiktok_product_client_1.TiktokProductClient,
            vtex_catalog_client_1.VtexCatalogClient,
            inventory_service_1.InventoryService,
            orders_service_1.OrdersService,
            orders_scheduler_1.OrdersInvoiceScheduler,
            tiktok_order_client_1.TiktokOrderClient,
            vtex_orders_client_1.VtexOrdersClient,
            logistics_service_1.LogisticsService,
            tiktok_logistics_client_1.TiktokLogisticsClient,
            idempotency_service_1.IdempotencyService,
            shop_config_service_1.ShopConfigService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map