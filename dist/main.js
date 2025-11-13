"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const express_1 = require("express");
const helmet_1 = require("helmet");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const utils_1 = require("./common/utils");
const request_context_service_1 = require("./common/request-context.service");
const prisma_service_1 = require("./prisma/prisma.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true,
    });
    const configService = app.get((config_1.ConfigService));
    const requestContext = app.get(request_context_service_1.RequestContextService);
    app.use((0, helmet_1.default)());
    app.use((0, express_1.json)({
        verify: (req, _res, buffer) => {
            req.rawBody = buffer;
        },
    }));
    app.use((0, express_1.urlencoded)({
        extended: true,
    }));
    app.use((req, _res, next) => {
        const requestId = req.headers['x-request-id'] ?? (0, utils_1.generateRequestId)();
        req.headers['x-request-id'] = requestId;
        requestContext.runWithRequestId(requestId, () => next());
    });
    const prismaService = app.get(prisma_service_1.PrismaService);
    await prismaService.enableShutdownHooks(app);
    setupSwagger(app, configService);
    const port = configService.get('PORT', { infer: true }) ?? 3000;
    await app.listen(port, '0.0.0.0');
}
function setupSwagger(app, configService) {
    const username = configService.getOrThrow('SWAGGER_USERNAME', { infer: true });
    const password = configService.getOrThrow('SWAGGER_PASSWORD', { infer: true });
    const isProduction = configService.getOrThrow('NODE_ENV', { infer: true }) === 'production';
    const config = new swagger_1.DocumentBuilder()
        .setTitle('VTEX ↔ TikTok Shop Middleware')
        .setDescription('APIs internas de sincronização e webhooks')
        .setVersion('1.0.0')
        .addBearerAuth()
        .addApiKey({
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Chave interna do middleware para rotas protegidas',
    }, 'middlewareApiKey')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    if (isProduction) {
        const expressApp = app.getHttpAdapter().getInstance();
        expressApp.use('/docs', (req, res, next) => {
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
    swagger_1.SwaggerModule.setup('docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    });
}
bootstrap();
//# sourceMappingURL=main.js.map