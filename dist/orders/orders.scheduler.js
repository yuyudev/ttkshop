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
var OrdersInvoiceScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersInvoiceScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const nestjs_pino_1 = require("nestjs-pino");
const orders_service_1 = require("./orders.service");
let OrdersInvoiceScheduler = OrdersInvoiceScheduler_1 = class OrdersInvoiceScheduler {
    constructor(ordersService, configService, logger) {
        this.ordersService = ordersService;
        this.configService = configService;
        this.logger = logger;
        this.logger.setContext(OrdersInvoiceScheduler_1.name);
    }
    async pollPendingInvoices() {
        const enabled = this.configService.get('VTEX_INVOICE_POLL_ENABLED', { infer: true }) ?? true;
        if (!enabled) {
            return;
        }
        const batchSize = this.configService.get('VTEX_INVOICE_POLL_BATCH', { infer: true }) ?? 50;
        const maxAgeDays = this.configService.get('VTEX_INVOICE_POLL_MAX_AGE_DAYS', { infer: true }) ?? 30;
        try {
            await this.ordersService.pollPendingInvoices({
                batchSize,
                maxAgeDays,
            });
        }
        catch (error) {
            this.logger.error({ err: error }, 'Failed to poll pending VTEX invoices');
        }
    }
};
exports.OrdersInvoiceScheduler = OrdersInvoiceScheduler;
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OrdersInvoiceScheduler.prototype, "pollPendingInvoices", null);
exports.OrdersInvoiceScheduler = OrdersInvoiceScheduler = OrdersInvoiceScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
        config_1.ConfigService,
        nestjs_pino_1.PinoLogger])
], OrdersInvoiceScheduler);
//# sourceMappingURL=orders.scheduler.js.map