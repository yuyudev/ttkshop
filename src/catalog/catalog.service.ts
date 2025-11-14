import { Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { CatalogSyncDto } from '../common/dto';
import {
  VtexCatalogClient,
  VtexProduct,
  VtexSkuImage,
  VtexSkuSummary,
} from './vtex-catalog.client';
import {
  TiktokProductClient,
  TiktokProductInput,
  TiktokProductSkuInput,
} from './tiktok-product.client';

@Injectable()
export class CatalogService {
  // limite de SKUs processados por execução para evitar timeout
  private readonly MAX_SKUS_PER_RUN = 50;
  private readonly productSkuCache = new Map<string, string[]>();

  constructor(
    private readonly vtexClient: VtexCatalogClient,
    private readonly tiktokClient: TiktokProductClient,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CatalogService.name);
  }

  /**
   * Endpoint atual de sync.
   * Agora ele:
   * - Busca todos os SKUs na VTEX
   * - Processa apenas um batch (MAX_SKUS_PER_RUN) por chamada
   * - Usa um helper que faz o sync de 1 SKU (ótimo p/ cron reaproveitar depois)
   */
  async syncCatalog(shopId: string, input: CatalogSyncDto) {
    const skuSummaries = await this.vtexClient.listSkus(input.updatedFrom);

    let processed = 0;
    let synced = 0;
    const errors: Record<string, string> = {};
    const processedSkuIds = new Set<string>();

    for (const summary of skuSummaries) {
      const skuId = String(summary.id);
      if (!skuId || processedSkuIds.has(skuId)) {
        continue;
      }

      if (processed >= this.MAX_SKUS_PER_RUN) {
        break;
      }

      const remainingBudget = this.MAX_SKUS_PER_RUN - processed;
      const result = await this.syncProductBySku(
        shopId,
        skuId,
        processedSkuIds,
        remainingBudget,
        processed === 0,
      );

      if (result.budgetExceeded) {
        this.logger.debug(
          { shopId, skuId, remainingBudget },
          'Catalog sync budget reached; stopping current run',
        );
        break;
      }

      processed += result.processedSkus;
      synced += result.syncedSkus;

      Object.assign(errors, result.errors);

      if (processed >= this.MAX_SKUS_PER_RUN) {
        break;
      }
    }

    const remaining = Math.max(skuSummaries.length - processedSkuIds.size, 0);

    return {
      processed,
      synced,
      failed: processed - synced,
      remaining,
      errors,
    };
  }

  private async syncProductBySku(
    shopId: string,
    vtexSkuId: string,
    processedSkuIds: Set<string>,
    remainingBudget: number,
    allowBudgetOverflow: boolean,
  ): Promise<{
    processedSkus: number;
    syncedSkus: number;
    errors: Record<string, string>;
    budgetExceeded?: boolean;
  }> {
    const errors: Record<string, string> = {};
    let relatedSkuIds: string[] = [];
    let productId: string | null = null;

    try {
      const sku = await this.vtexClient.getSkuById(vtexSkuId);
      productId = this.extractProductId(sku);
      if (!productId) {
        throw new Error('VTEX SKU did not include productId');
      }

      const product = await this.vtexClient.getProductById(productId);
      relatedSkuIds = await this.getSkuIdsForProduct(productId, vtexSkuId);

      if (
        !allowBudgetOverflow &&
        remainingBudget >= 0 &&
        relatedSkuIds.length > remainingBudget
      ) {
        return {
          processedSkus: 0,
          syncedSkus: 0,
          errors,
          budgetExceeded: true,
        };
      }

      const mappings = await this.prisma.productMap.findMany({
        where: { vtexSkuId: { in: relatedSkuIds } },
      });
      const mappingBySkuId = new Map(mappings.map((mapping) => [mapping.vtexSkuId, mapping]));

      const skuInputs: TiktokProductSkuInput[] = [];

      for (const skuId of relatedSkuIds) {
        const skuDetails =
          skuId === vtexSkuId ? sku : await this.vtexClient.getSkuById(skuId);
        const price = await this.vtexClient.getPrice(skuId);
        const images = await this.fetchImagesSafely(skuId);
        const quantity = skuDetails.StockBalance ?? skuDetails.stockBalance ?? 0;
        const mapping = mappingBySkuId.get(skuId);

        skuInputs.push({
          vtexSkuId: skuId,
          sku: skuDetails,
          price,
          quantity,
          images,
          sizeLabel: this.deriveSizeLabel(product, skuDetails),
          ttsSkuId: mapping?.ttsSkuId ?? null,
        });
      }

      const productInput: TiktokProductInput = {
        product,
        skus: skuInputs,
      };

      const existingProductId = this.selectExistingProductId(mappings);

      const response = existingProductId
        ? await this.tiktokClient.updateProduct(shopId, existingProductId, productInput)
        : await this.tiktokClient.createProduct(shopId, productInput);

      const targetProductId = response.productId ?? existingProductId ?? null;

      let syncedSkus = 0;

      for (const skuInput of skuInputs) {
        const mappedSkuId =
          response.skuIds[String(skuInput.vtexSkuId)] ??
          skuInput.ttsSkuId ??
          null;

        await this.prisma.productMap.upsert({
          where: { vtexSkuId: skuInput.vtexSkuId },
          update: {
            status: 'synced',
            lastError: null,
            shopId,
            ttsProductId: targetProductId,
            ttsSkuId: mappedSkuId,
          },
          create: {
            vtexSkuId: skuInput.vtexSkuId,
            shopId,
            status: 'synced',
            ttsProductId: targetProductId,
            ttsSkuId: mappedSkuId,
          },
        });

        processedSkuIds.add(skuInput.vtexSkuId);
        syncedSkus += 1;

        this.logger.info(
          {
            skuId: skuInput.vtexSkuId,
            ttsProductId: targetProductId,
            ttsSkuId: mappedSkuId,
          },
          existingProductId
            ? 'Successfully synced SKU to TikTok (update)'
            : 'Successfully synced SKU to TikTok (create)',
        );
      }

      return {
        processedSkus: skuInputs.length,
        syncedSkus,
        errors,
      };
    } catch (error) {
      const errorPayload = isAxiosError(error) ? error.response?.data : undefined;
      const message =
        errorPayload !== undefined
          ? JSON.stringify(errorPayload)
          : error instanceof Error
          ? error.message
          : 'Unknown error';

      this.logger.error(
        {
          err: error,
          skuId: vtexSkuId,
          relatedSkuIds,
          productId,
          errorPayload,
        },
        'Failed to sync VTEX product to TikTok',
      );

      const affectedSkuIds = relatedSkuIds.length ? relatedSkuIds : [vtexSkuId];

      for (const skuId of affectedSkuIds) {
        processedSkuIds.add(skuId);

        await this.prisma.productMap.upsert({
          where: { vtexSkuId: skuId },
          update: {
            status: 'error',
            lastError: message,
            shopId,
          },
          create: {
            vtexSkuId: skuId,
            shopId,
            status: 'error',
            lastError: message,
          },
        });

        errors[skuId] = message;
      }

      return {
        processedSkus: affectedSkuIds.length,
        syncedSkus: 0,
        errors,
      };
    }
  }

  private extractProductId(sku: VtexSkuSummary): string | null {
    const productId =
      sku?.ProductId ??
      sku?.productId ??
      (sku as any)?.ParentProductId ??
      null;
    return productId ? String(productId) : null;
  }

  private async getSkuIdsForProduct(productId: string, fallbackSkuId: string): Promise<string[]> {
    const cached = this.productSkuCache.get(productId);
    if (cached && cached.length) {
      if (!cached.includes(fallbackSkuId)) {
        const updated = Array.from(new Set([...cached, fallbackSkuId].map(String)));
        this.productSkuCache.set(productId, updated);
        return updated;
      }
      return cached;
    }

    let relatedSkuIds: string[] = [];

    try {
      const productSkusPayload = await this.vtexClient.getProductWithSkus(productId);
      relatedSkuIds = this.normalizeProductSkuIds(productSkusPayload);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        this.logger.warn(
          { productId },
          'VTEX product returned 404 for product SKUs endpoint; attempting search fallback',
        );
        relatedSkuIds = [];
      } else {
        throw error;
      }
    }

    if (!relatedSkuIds.length) {
      try {
        const searchPayload = await this.vtexClient.searchProductWithItems(productId);
        relatedSkuIds = this.extractSkuIdsFromSearchPayload(searchPayload);
      } catch (error) {
        if (this.isNotFoundError(error)) {
          this.logger.warn(
            { productId },
            'VTEX product search returned 404; using fallback SKU only',
          );
        } else {
          this.logger.error(
            { productId, err: error },
            'Failed to retrieve VTEX product SKUs via search fallback',
          );
        }
        relatedSkuIds = [];
      }
    }

    if (!relatedSkuIds.includes(fallbackSkuId)) {
      relatedSkuIds.push(fallbackSkuId);
    }

    const normalized = Array.from(new Set(relatedSkuIds.map(String)));
    this.productSkuCache.set(productId, normalized);
    return normalized;
  }

  private normalizeProductSkuIds(raw: unknown): string[] {
    const candidates: string[] = [];

    const register = (value: unknown) => {
      if (value === undefined || value === null) {
        return;
      }
      const id = String(value);
      if (id) {
        candidates.push(id);
      }
    };

    const handleItem = (item: any) => {
      if (!item) {
        return;
      }
      register(item.Id ?? item.id ?? item.SkuId ?? item.skuId ?? item.skuID ?? item);
    };

    if (Array.isArray(raw)) {
      raw.forEach(handleItem);
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        obj.items.forEach(handleItem);
      }
      if (Array.isArray(obj.skus)) {
        obj.skus.forEach(handleItem);
      }
      if (Array.isArray(obj.data)) {
        obj.data.forEach(handleItem);
      }
    }

    return Array.from(new Set(candidates));
  }

  private extractSkuIdsFromSearchPayload(raw: unknown): string[] {
    if (!raw) {
      return [];
    }

    const results = Array.isArray(raw) ? raw : [raw];
    const skuIds: string[] = [];

    for (const product of results) {
      if (!product || typeof product !== 'object') {
        continue;
      }

      const items = Array.isArray((product as any).items) ? (product as any).items : [];
      for (const item of items) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const itemId =
          item.itemId ??
          item.id ??
          item.skuId ??
          item.ItemId ??
          item.SkuId ??
          item.SkuID ??
          null;
        if (itemId) {
          skuIds.push(String(itemId));
        }
      }
    }

    return Array.from(new Set(skuIds));
  }

  private selectExistingProductId(
    mappings: Array<{ ttsProductId: string | null }>,
  ): string | null {
    const productIds = Array.from(
      new Set(
        mappings
          .map((mapping) => mapping.ttsProductId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (productIds.length > 1) {
      this.logger.warn(
        { productIds },
        'Multiple TikTok product IDs found for VTEX product; using the first one',
      );
    }

    return productIds[0] ?? null;
  }

  private deriveSizeLabel(product: VtexProduct, sku: VtexSkuSummary): string | undefined {
    const productName = product.Name?.toString().trim().toLowerCase() ?? '';
    const rawSkuName =
      sku.Name ??
      sku.name ??
      (sku as any)?.NameComplete ??
      '';
    const skuName = rawSkuName ? rawSkuName.toString().trim() : '';

    if (productName && skuName.toLowerCase().startsWith(productName)) {
      const suffix = skuName.slice(productName.length).trim();
      if (suffix) {
        return suffix;
      }
    }

    if (skuName.includes(' ')) {
      const candidate = skuName.split(/\s+/).pop();
      if (candidate) {
        return candidate.trim();
      }
    }

    const refId = (sku as any)?.RefId ?? (sku as any)?.refId;
    if (typeof refId === 'string' && refId.includes('_')) {
      const parts = refId
        .split(/[_-]/)
        .map((part) => part.trim())
        .filter(Boolean);
      const candidate = parts[parts.length - 1];
      if (candidate && candidate.length <= 6) {
        return candidate;
      }
    }

    return undefined;
  }

  private async fetchImagesSafely(skuId: string): Promise<VtexSkuImage[]> {
    try {
      return await this.vtexClient.getSkuImages(String(skuId));
    } catch (error) {
      if (this.isNotFoundError(error)) {
        this.logger.warn(
          { skuId },
          'VTEX product returned 404 for images endpoint; proceeding without images',
        );
        return [];
      }
      throw error;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      (error as any).response?.status === 404
    );
  }
}
