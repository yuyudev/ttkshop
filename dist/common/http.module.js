"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var HttpClientConfigurator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClientModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const nestjs_pino_1 = require("nestjs-pino");
const promises_1 = require("timers/promises");
const request_context_service_1 = require("./request-context.service");
const shouldRetryStatus = new Set([408, 429, 500, 502, 503, 504]);
let HttpClientConfigurator = HttpClientConfigurator_1 = class HttpClientConfigurator {
    constructor(httpService, configService, requestContext, logger) {
        this.httpService = httpService;
        this.configService = configService;
        this.requestContext = requestContext;
        this.logger = logger;
        this.logger.setContext(HttpClientConfigurator_1.name);
        this.maxRetries = this.configService.get('HTTP_MAX_RETRIES', { infer: true }) ?? 3;
    }
    onModuleInit() {
        const axios = this.httpService.axiosRef;
        axios.interceptors.request.use((config) => {
            const requestId = this.requestContext.getRequestId();
            config.headers = config.headers ?? {};
            config.headers['x-request-id'] = requestId;
            this.logger.debug({
                msg: 'HTTP request',
                method: config.method,
                url: config.url,
                retryCount: config.__retryCount ?? 0,
                requestId,
            }, 'http_request');
            return config;
        });
        axios.interceptors.response.use((response) => {
            this.logger.debug({
                msg: 'HTTP response',
                method: response.config.method,
                url: response.config.url,
                status: response.status,
            }, 'http_response');
            return response;
        }, async (error) => {
            const config = error.config;
            const retryCount = config?.__retryCount ?? 0;
            const status = error.response?.status;
            const safeError = {
                message: error.message,
                status,
                code: error.code,
                url: error.config?.url,
                method: error.config?.method,
            };
            const headers = this.sanitizeHeaders(error.config?.headers);
            this.logger.error({
                err: safeError,
                request: {
                    method: error.config?.method,
                    url: error.config?.url,
                    headers,
                    params: error.config?.params,
                    data: error.config?.data,
                },
            }, 'HTTP request failed');
            if (!config || retryCount >= this.maxRetries || !this.isRetriable(error)) {
                throw error;
            }
            config.__retryCount = retryCount + 1;
            const delayMs = this.getBackoffDelay(config.__retryCount);
            await (0, promises_1.setTimeout)(delayMs);
            return axios.request(config);
        });
    }
    getBackoffDelay(attempt) {
        const base = 250;
        const max = 2000;
        return Math.min(base * 2 ** (attempt - 1), max);
    }
    sanitizeHeaders(raw) {
        const masked = {};
        const sensitiveKeys = [
            'authorization',
            'x-tts-access-token',
            'x-vtex-api-apptoken',
            'x-vtex-api-appkey',
            'x-api-key',
            'app-token',
            'appkey',
            'apptoken',
            'token',
        ];
        const maskValue = (value) => {
            if (typeof value !== 'string') {
                return String(value ?? '');
            }
            if (value.length <= 8) {
                return '***';
            }
            return `${value.slice(0, 3)}***${value.slice(-2)}`;
        };
        Object.entries(raw || {}).forEach(([key, value]) => {
            const lowered = key.toLowerCase();
            if (sensitiveKeys.some((candidate) => lowered.includes(candidate))) {
                masked[key] = maskValue(Array.isArray(value) ? value.join(',') : value);
                return;
            }
            masked[key] = Array.isArray(value) ? value.join(',') : String(value);
        });
        return masked;
    }
    isRetriable(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return true;
        }
        const status = error.response?.status;
        return status ? shouldRetryStatus.has(status) : false;
    }
};
HttpClientConfigurator = HttpClientConfigurator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        request_context_service_1.RequestContextService,
        nestjs_pino_1.PinoLogger])
], HttpClientConfigurator);
let HttpClientModule = class HttpClientModule {
};
exports.HttpClientModule = HttpClientModule;
exports.HttpClientModule = HttpClientModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    timeout: config.get('REQUEST_TIMEOUT_MS'),
                    maxRedirects: 5,
                }),
            }),
        ],
        providers: [HttpClientConfigurator, request_context_service_1.RequestContextService],
        exports: [axios_1.HttpModule, request_context_service_1.RequestContextService],
    })
], HttpClientModule);
//# sourceMappingURL=http.module.js.map