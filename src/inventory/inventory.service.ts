import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { InventorySyncDto } from '../common/dto';
import { PrismaService } from '../prisma/prisma.service';
import { VtexCatalogClient } from '../catalog/vtex-catalog.client';
import { TiktokProductClient } from '../catalog/tiktok-product.client';

type ProductMapRecord = {
  vtexSkuId: string;
  ttsSkuId: string | null;
  ttsProductId: string | null;
};

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

  // Cronjob removido temporariamente; sync manual via endpoint /internal/inventory/sync

  async syncInventory(shopId: string, payload: InventorySyncDto) {
    const mappings = (await this.prisma.productMap.findMany({
      where: {
        status: 'synced',
        ttsSkuId: { not: null },
        shopId,
      },
    })) as ProductMapRecord[];

    const skuIds = payload.skuIds?.length
      ? payload.skuIds
      : mappings.map((item: ProductMapRecord) => item.vtexSkuId);
    const warehouseId = payload.warehouseId ?? 'DEFAULT';

    const results = [];
    for (const skuId of skuIds) {
      try {
        const sku = await this.vtexClient.getSkuById(skuId);
        const inventory = sku.StockBalance ?? sku.stockBalance ?? 0;

        const mapping = mappings.find((item: ProductMapRecord) => item.vtexSkuId === skuId);
        if (!mapping?.ttsSkuId || !mapping.ttsProductId) {
          continue;
        }

        await this.tiktokClient.updateStock(
          shopId,
          warehouseId,
          mapping.ttsSkuId,
          inventory,
          mapping.ttsProductId,
        );


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

  async handleVtexWebhook(payload: any) {
    // VTEX Inventory Broadcaster payload example:
    // { "IdSku": "1", "HasStockKeepingUnitRemovedFromAffiliateId": false, "IdAffiliate": "..." }
    // Or sometimes a list. We'll handle single object or array.

    const items = Array.isArray(payload) ? payload : [payload];
    const skuIds = items
      .map((item) => item?.IdSku || item?.idSku || item?.skuId)
      .filter((id) => !!id);

    if (!skuIds.length) {
      this.logger.warn({ payload }, 'Received VTEX inventory webhook with no valid SKUs');
      return { status: 'ignored', reason: 'no_skus_found' };
    }

    this.logger.info({ skuIds }, 'Processing VTEX inventory webhook');

    // Reusing the sync logic but filtering by these SKUs
    // We need to find which shops have these SKUs mapped.
    // Since we might have multiple shops, we need to find mappings for these SKUs across all shops.

    const mappings = await this.prisma.productMap.findMany({
      where: {
        vtexSkuId: { in: skuIds },
        status: 'synced',
        ttsSkuId: { not: null },
      },
    });

    if (!mappings.length) {
      return { status: 'ignored', reason: 'skus_not_mapped' };
    }

    // Group by Shop to optimize calls (though syncInventory takes one shop)
    // Actually syncInventory is designed for one shop.
    // We can iterate over unique shops found in mappings.

    const shops = [...new Set(mappings.map((m) => m.shopId))];
    const results = [];

    for (const shopId of shops) {
      const shopSkuIds = mappings
        .filter((m) => m.shopId === shopId)
        .map((m) => m.vtexSkuId);

      // Call existing sync logic for this shop and specific SKUs
      const result = await this.syncInventory(shopId, { skuIds: shopSkuIds });
      results.push(result);
    }

    return { status: 'processed', results };
  }
}
