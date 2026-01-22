import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { InventorySyncDto } from '../common/dto';
import { PrismaService } from '../prisma/prisma.service';
import { VtexCatalogClient } from '../catalog/vtex-catalog.client';
import { TiktokProductClient } from '../catalog/tiktok-product.client';
import { CatalogService } from '../catalog/catalog.service';
import { ShopConfigService } from '../common/shop-config.service';

type ProductMapRecord = {
  vtexSkuId: string;
  shopId: string;
  ttsSkuId: string | null;
  ttsProductId: string | null;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vtexClient: VtexCatalogClient,
    private readonly tiktokClient: TiktokProductClient,
    private readonly catalogService: CatalogService,
    private readonly shopConfigService: ShopConfigService,
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
    const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
    const warehouseId = payload.warehouseId ?? vtexConfig.warehouseId;

    const results = [];
    for (const skuId of skuIds) {
      try {
        // Use Logistics API to get real-time inventory
        const inventory = await this.vtexClient.getSkuInventory(shopId, skuId, warehouseId);

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
    this.logger.info({ payload }, 'VTEX inventory webhook payload received');
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

    this.logger.info(
      { skuCount: skuIds.length, skuIds },
      'Processing VTEX inventory webhook',
    );

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
      this.logger.warn(
        { skuIds, skuCount: skuIds.length },
        'VTEX inventory webhook SKUs not mapped',
      );
      return { status: 'ignored', reason: 'skus_not_mapped' };
    }

    // Group by Shop to optimize calls (though syncInventory takes one shop)
    // Actually syncInventory is designed for one shop.
    // We can iterate over unique shops found in mappings.

    const shops = [...new Set(mappings.map((m) => m.shopId))];
    this.logger.info(
      { shopCount: shops.length, shops, mappedSkus: mappings.length },
      'Resolved shops for VTEX inventory webhook',
    );
    const results = [];

    for (const shopId of shops) {
      const shopSkuIds = mappings
        .filter((m) => m.shopId === shopId)
        .map((m) => m.vtexSkuId);

      this.logger.info(
        { shopId, skuCount: shopSkuIds.length, skuIds: shopSkuIds },
        'Syncing inventory for VTEX webhook shop',
      );

      // Call existing sync logic for this shop and specific SKUs
      const result = await this.syncInventory(shopId, { skuIds: shopSkuIds });
      results.push(result);
    }

    return { status: 'processed', results };
  }

  scheduleVtexInventory(payload: any) {
    setImmediate(() => {
      this.handleVtexWebhook(payload).catch((error) => {
        this.logger.error({ err: error }, 'Failed to process VTEX inventory webhook');
      });
    });
  }

  scheduleVtexNotification(payload: any, shopId?: string) {
    setImmediate(() => {
      this.handleVtexNotification(payload, shopId).catch((error) => {
        this.logger.error({ err: error }, 'Failed to process VTEX notification');
      });
    });
  }

  async handleVtexNotification(payload: any, shopId?: string) {
    this.logger.info({ payload }, 'VTEX broadcaster notification payload received');
    const items = Array.isArray(payload) ? payload : [payload];
    this.logger.info(
      { itemCount: items.length, items },
      'VTEX broadcaster items received',
    );
    const events = items
      .map((item) => this.normalizeAffiliateNotification(item))
      .filter((event) => event.skuId);

    if (!events.length) {
      this.logger.warn({ payload }, 'Received VTEX notification with no valid SKUs');
      return { status: 'ignored', reason: 'no_skus_found' };
    }

    this.logger.info({ events }, 'VTEX broadcaster events normalized');

    const stockSkuIds = new Set<string>();
    const updateSkuIds = new Set<string>();
    const productIdBySku = new Map<string, string>();

    let fallbackStockCount = 0;

    for (const event of events) {
      const hasExplicitFlags = event.stockModified || event.priceModified || event.skuModified;
      if (!hasExplicitFlags && !event.removedFromAffiliate) {
        event.stockModified = true;
        fallbackStockCount += 1;
      }
      if (event.productId) {
        productIdBySku.set(event.skuId, event.productId);
      }
      if (event.stockModified) {
        stockSkuIds.add(event.skuId);
      }
      if (event.priceModified || event.skuModified) {
        updateSkuIds.add(event.skuId);
      }
      if (event.isActive === false || event.removedFromAffiliate) {
        this.logger.warn(
          { skuId: event.skuId, productId: event.productId },
          'VTEX notification indicates inactive or removed SKU',
        );
      }
    }

    if (fallbackStockCount > 0) {
      this.logger.info(
        { fallbackStockCount, totalEvents: events.length },
        'VTEX notification missing flags; defaulting to stock sync',
      );
    }

    const relevantSkuIds = Array.from(new Set([...stockSkuIds, ...updateSkuIds]));
    if (!relevantSkuIds.length) {
      this.logger.warn(
        { events },
        'VTEX notification did not include stock/price/sku flags',
      );
      return { status: 'ignored', reason: 'no_relevant_flags' };
    }

    this.logger.info(
      {
        stockSkuIds: Array.from(stockSkuIds),
        updateSkuIds: Array.from(updateSkuIds),
      },
      'VTEX broadcaster SKU flags resolved',
    );

    const mappings = (await this.prisma.productMap.findMany({
      where: {
        vtexSkuId: { in: relevantSkuIds },
        status: 'synced',
        ttsSkuId: { not: null },
        ttsProductId: { not: null },
        ...(shopId ? { shopId } : {}),
      },
    })) as ProductMapRecord[];

    if (!mappings.length) {
      this.logger.warn(
        { relevantSkuIds, skuCount: relevantSkuIds.length },
        'VTEX notification SKUs not mapped',
      );
      return { status: 'ignored', reason: 'skus_not_mapped' };
    }

    const shopIds = Array.from(new Set(mappings.map((mapping) => mapping.shopId)));
    this.logger.info(
      { shopCount: shopIds.length, shopIds, mappedSkus: mappings.length },
      'Resolved shops for VTEX notification',
    );
    const results: Array<Record<string, unknown>> = [];

    for (const shopId of shopIds) {
      const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
      const warehouseId = vtexConfig.warehouseId;
      const shopMappings = mappings.filter((mapping) => mapping.shopId === shopId);
      const shopSkuIds = new Set(shopMappings.map((mapping) => mapping.vtexSkuId));
      const shopUpdateSkuIds = Array.from(updateSkuIds).filter((skuId) =>
        shopSkuIds.has(skuId),
      );
      const shopStockSkuIds = Array.from(stockSkuIds).filter(
        (skuId) => shopSkuIds.has(skuId) && !updateSkuIds.has(skuId),
      );

      this.logger.info(
        {
          shopId,
          stockSkuIds: shopStockSkuIds,
          updateSkuIds: shopUpdateSkuIds,
          warehouseId,
        },
        'Prepared VTEX notification sync for shop',
      );

      if (shopStockSkuIds.length) {
        const result = await this.syncInventory(shopId, {
          skuIds: shopStockSkuIds,
          warehouseId,
        });
        results.push({
          shopId,
          type: 'stock',
          skuCount: shopStockSkuIds.length,
          result,
        });
      }

      if (shopUpdateSkuIds.length) {
        const productIds = new Set<string>();
        const fallbackSkuIds: string[] = [];

        for (const skuId of shopUpdateSkuIds) {
          const productId = productIdBySku.get(skuId);
          if (productId) {
            productIds.add(productId);
          } else {
            fallbackSkuIds.push(skuId);
          }
        }

        const updateResults: Array<Record<string, unknown>> = [];

        this.logger.info(
          {
            shopId,
            productIds: Array.from(productIds),
            fallbackSkuIds,
          },
          'VTEX notification product update targets resolved',
        );

        for (const productId of productIds) {
          try {
            await this.catalogService.syncProduct(shopId, productId, {
              allowZeroStock: true,
            });
            updateResults.push({ productId, status: 'synced' });
          } catch (error) {
            this.logger.error(
              { err: error, shopId, productId },
              'Failed to sync product after VTEX notification',
            );
            updateResults.push({
              productId,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        for (const skuId of fallbackSkuIds) {
          try {
            await this.catalogService.syncProductBySkuId(shopId, skuId, {
              allowZeroStock: true,
            });
            updateResults.push({ skuId, status: 'synced' });
          } catch (error) {
            this.logger.error(
              { err: error, shopId, skuId },
              'Failed to sync SKU after VTEX notification',
            );
            updateResults.push({
              skuId,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        results.push({
          shopId,
          type: 'product',
          skuCount: shopUpdateSkuIds.length,
          updates: updateResults,
        });
      }
    }

    return { status: 'processed', results };
  }

  private normalizeAffiliateNotification(item: any) {
    const skuId = this.extractSkuId(item);
    const productId = this.extractProductId(item);
    const stockModified = this.toBoolean(
      item?.StockModified ?? item?.stockModified ?? item?.StockChanged,
    );
    const priceModified = this.toBoolean(
      item?.PriceModified ?? item?.priceModified ?? item?.PriceChanged,
    );
    const skuModified = this.toBoolean(
      item?.HasStockKeepingUnitModified ??
        item?.hasStockKeepingUnitModified ??
        item?.SkuModified,
    );
    const isActive = item?.IsActive ?? item?.isActive;
    const removedFromAffiliate =
      item?.HasStockKeepingUnitRemovedFromAffiliate ??
      item?.HasStockKeepingUnitRemovedFromAffiliateId ??
      item?.hasStockKeepingUnitRemovedFromAffiliate ??
      false;

    return {
      skuId,
      productId,
      stockModified,
      priceModified,
      skuModified,
      isActive:
        isActive === undefined || isActive === null ? undefined : this.toBoolean(isActive),
      removedFromAffiliate: this.toBoolean(removedFromAffiliate),
    };
  }

  private extractSkuId(item: any): string {
    const candidate =
      item?.IdSku ??
      item?.idSku ??
      item?.skuId ??
      item?.SkuId ??
      item?.SKUId ??
      null;
    return candidate ? String(candidate) : '';
  }

  private extractProductId(item: any): string | null {
    const candidate =
      item?.ProductId ??
      item?.productId ??
      item?.IdProduct ??
      item?.idProduct ??
      null;
    return candidate ? String(candidate) : null;
  }

  private toBoolean(value: unknown): boolean {
    if (value === true || value === 1 || value === '1') {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }
    return false;
  }
}
