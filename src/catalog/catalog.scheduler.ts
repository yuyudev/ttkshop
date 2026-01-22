import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { VtexCatalogClient } from './vtex-catalog.client';

@Injectable()
export class CatalogScheduler {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly prisma: PrismaService,
    private readonly vtexClient: VtexCatalogClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CatalogScheduler.name);
  }

  @Cron('1 0 20 11 *', { timeZone: 'America/Sao_Paulo' })
  async nightlySync(): Promise<void> {
    const now = new Date();
    if (now.getFullYear() !== 2025) {
      return;
    }
    const distinctShops = await this.prisma.tiktokAuth.findMany({
      select: { shopId: true },
    });

    for (const { shopId } of distinctShops) {
      await this.syncAllProducts(shopId, '471');
    }
  }

  async syncAllProducts(shopId: string, startProductId?: string): Promise<void> {
    this.logger.info({ shopId }, 'Starting full catalog sync');

    const skuSummaries = await this.vtexClient.listSkus(shopId);
    if (!skuSummaries.length) {
      this.logger.warn({ shopId }, 'VTEX listSkus returned no products; aborting');
      return;
    }

    const initialProductIds = Array.from(
      new Set(
        skuSummaries
          .map((sku) => sku.productId ?? (sku as any).ProductId ?? sku.id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const productIds = startProductId
      ? initialProductIds.filter((id) => this.compareProductIds(id, startProductId) >= 0)
      : initialProductIds;

    if (!productIds.length) {
      this.logger.warn({ shopId }, 'No VTEX product IDs found in SKUs; aborting');
      return;
    }

    let consecutiveFailures = 0;

    for (const productId of productIds) {
      try {
        await this.catalogService.syncProduct(shopId, productId);
        consecutiveFailures = 0;
      } catch (error) {
        this.logger.error(
          { shopId, productId, err: error },
          'Failed to sync product during cron; continuing',
        );
        consecutiveFailures += 1;
        if (consecutiveFailures >= 5) {
          this.logger.warn(
            { shopId, productId },
            'Stopping full catalog sync after 5 consecutive failures',
          );
          this.logger.info(
            { shopId, count: productIds.length },
            'Completed partial catalog sync',
          );
          return;
        }
      }
    }

    this.logger.info(
      { shopId, count: productIds.length, startProductId },
      'Completed full catalog sync',
    );
  }

  private compareProductIds(a: string, b: string): number {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  }
}
