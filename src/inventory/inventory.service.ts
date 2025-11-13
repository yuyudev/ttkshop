import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { InventorySyncDto } from '../common/dto';
import { PrismaService } from '../prisma/prisma.service';
import { VtexCatalogClient } from '../catalog/vtex-catalog.client';
import { TiktokProductClient } from '../catalog/tiktok-product.client';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vtexClient: VtexCatalogClient,
    private readonly tiktokClient: TiktokProductClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(InventoryService.name);
  }

  @Cron('*/10 * * * *')
  async scheduledSync(): Promise<void> {
    const distinctShops = await this.prisma.tiktokAuth.findMany({
      select: { shopId: true },
    });

    for (const { shopId } of distinctShops) {
      await this.syncInventory(shopId, {});
    }
  }

  async syncInventory(shopId: string, payload: InventorySyncDto) {
    const mappings = await this.prisma.productMap.findMany({
      where: {
        status: 'synced',
        ttsSkuId: { not: null },
        shopId,
      },
    });

    const skuIds = payload.skuIds?.length ? payload.skuIds : mappings.map((item) => item.vtexSkuId);
    const warehouseId = payload.warehouseId ?? 'DEFAULT';

    const results = [];
    for (const skuId of skuIds) {
      try {
        const sku = await this.vtexClient.getSkuById(skuId);
        const inventory = sku.StockBalance ?? sku.stockBalance ?? 0;

        const mapping = mappings.find((item) => item.vtexSkuId === skuId);
        if (!mapping?.ttsSkuId) {
          continue;
        }

        await this.tiktokClient.updateStock(shopId, warehouseId, mapping.ttsSkuId, inventory);

        results.push({ skuId, inventory, status: 'synced' });
      } catch (error) {
        this.logger.error({ err: error, skuId }, 'Failed to sync inventory for SKU');
        results.push({
          skuId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      shopId,
      warehouseId,
      count: results.length,
      results,
    };
  }
}
