import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersInvoiceScheduler {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrdersInvoiceScheduler.name);
  }

  // Runs periodically to compensate for missing VTEX marketplace webhooks.
  @Cron('*/5 * * * *')
  async pollPendingInvoices() {
    const enabled =
      this.configService.get<boolean>('VTEX_INVOICE_POLL_ENABLED', { infer: true }) ?? true;
    if (!enabled) {
      return;
    }

    const batchSize =
      this.configService.get<number>('VTEX_INVOICE_POLL_BATCH', { infer: true }) ?? 50;
    const maxAgeDays =
      this.configService.get<number>('VTEX_INVOICE_POLL_MAX_AGE_DAYS', { infer: true }) ?? 30;

    try {
      await this.ordersService.pollPendingInvoices({
        batchSize,
        maxAgeDays,
      });
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to poll pending VTEX invoices');
    }
  }
}
