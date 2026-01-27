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
  TiktokProductResponse,
  TiktokProductSkuInput,
} from './tiktok-product.client';
import { CategoryMappingService } from './category-mapping.service';
import { ShopConfigService } from '../common/shop-config.service';

type ProductMapRecord = {
  vtexSkuId: string;
  ttsProductId: string | null;
  ttsSkuId: string | null;
  ttsCategoryId?: string | null;
};

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
    private readonly categoryMappingService: CategoryMappingService,
    private readonly shopConfigService: ShopConfigService,
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
    const skuSummaries = await this.vtexClient.listSkus(shopId, input.updatedFrom);
    const processedSkuIds = new Set<string>();
    const productGroups = new Map<string, string[]>();

    /**
     * Agrupar SKUs por productId, mas respeitando um limite
     * de quantos SKUs vamos considerar nesse run.
     *
     * Isso evita chamar getSkuById para TODOS os SKUs da VTEX
     * em uma única requisição HTTP.
     */
    let groupedSkuCount = 0;

    for (const { id } of skuSummaries) {
      if (groupedSkuCount >= this.MAX_SKUS_PER_RUN) {
        break;
      }

      const skuId = String(id);
      if (!skuId) continue;

      const sku = await this.vtexClient.getSkuById(shopId, skuId);
      const productId = this.extractProductId(sku);
      if (!productId) continue;

      if (!productGroups.has(productId)) {
        productGroups.set(productId, []);
      }
      productGroups.get(productId)!.push(skuId);

      groupedSkuCount += 1;
    }

    let processed = 0;
    let synced = 0;
    const errors: Record<string, string> = {};

    for (const [, skuIds] of productGroups) {
      if (processed >= this.MAX_SKUS_PER_RUN) break;
      const remainingBudget = this.MAX_SKUS_PER_RUN - processed;
      const result = await this.syncProductBySku(
        shopId,
        skuIds[0],
        processedSkuIds,
        remainingBudget,
        processed === 0,
      );
      if (result.budgetExceeded) break;
      processed += result.processedSkus;
      synced += result.syncedSkus;
      Object.assign(errors, result.errors);
    }

    const remaining = Math.max(skuSummaries.length - processedSkuIds.size, 0);
    return { processed, synced, failed: processed - synced, remaining, errors };
  }

  private async syncProductBySku(
    shopId: string,
    vtexSkuId: string,
    processedSkuIds: Set<string>,
    remainingBudget: number,
    allowBudgetOverflow: boolean,
    allowZeroStock = false,
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
      const sku = await this.vtexClient.getSkuById(shopId, vtexSkuId);
      productId = this.extractProductId(sku);
      if (!productId) {
        throw new Error('VTEX SKU did not include productId');
      }

      const product = await this.vtexClient.getProductById(shopId, productId);
      relatedSkuIds = await this.getSkuIdsForProduct(shopId, productId, vtexSkuId);

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

      /**
       * 1) Buscar mappings existentes (VTEX SKU -> TikTok product/sku)
       *    Já filtrando por shopId para evitar sujeira de outras lojas.
       */
      const mappings = (await this.prisma.productMap.findMany({
        where: {
          shopId,
          vtexSkuId: { in: relatedSkuIds },
        },
      })) as ProductMapRecord[];

      /**
       * 2) Descobrir quais productIds do TikTok existem para esse conjunto de SKUs.
       *    Se tiver mais de um, isso está inconsistente: vamos resetar tudo
       *    e tratar como produto novo no TikTok.
       */
      const distinctProductIds: string[] = Array.from(
        new Set(
          mappings
            .map((mapping: ProductMapRecord) => mapping.ttsProductId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      let existingProductId: string | null = null;
      let effectiveMappings: ProductMapRecord[] = mappings;

      if (distinctProductIds.length === 1) {
        existingProductId = distinctProductIds[0];

        // por segurança, filtra apenas mappings que apontam para esse productId
        effectiveMappings = mappings.filter(
          (mapping: ProductMapRecord) => mapping.ttsProductId === existingProductId,
        );
      } else if (distinctProductIds.length > 1) {
        // cenário quebrado: vários TikTok productIds para o mesmo VTEX product
        this.logger.warn(
          {
            vtexProductId: product.Id,
            relatedSkuIds,
            ttsProductIds: distinctProductIds,
          },
          'Multiple TikTok product IDs found for VTEX product; resetting mappings and recreating product on TikTok',
        );

        await this.prisma.productMap.updateMany({
          where: {
            shopId,
            vtexSkuId: { in: relatedSkuIds },
          },
          data: {
            status: 'pending',
            lastError: null,
            ttsProductId: null,
            ttsSkuId: null,
            ttsCategoryId: null,
          } as any,
        });

        existingProductId = null;
        effectiveMappings = [];
      } else {
        // nenhum productId ainda: vamos criar um produto novo no TikTok
        existingProductId = null;
        effectiveMappings = [];
      }

      /**
       * 3) Construir mapa por vtexSkuId, usando apenas mappings "saudáveis"
       *    (ou seja, que apontam para o mesmo ttsProductId, se houver).
       */
      const mappingBySkuId = new Map<string, ProductMapRecord>(
        effectiveMappings.map(
          (mapping) => [mapping.vtexSkuId, mapping] as [string, ProductMapRecord],
        ),
      );

      const skuInputs: TiktokProductSkuInput[] = [];
      const vtexConfig = await this.shopConfigService.getVtexConfig(shopId);
      const vtexWarehouseId = vtexConfig.warehouseId;

      for (const skuId of relatedSkuIds) {
        const skuDetails =
          skuId === vtexSkuId ? sku : await this.vtexClient.getSkuById(shopId, skuId);

        const price = await this.vtexClient.getPrice(shopId, skuId);
        const images = await this.fetchImagesSafely(shopId, skuId);
        const quantity = await this.vtexClient.getSkuInventory(shopId, skuId, vtexWarehouseId);

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

      // Normalizar labels de tamanho por produto
      const seenSizes = new Set<string>();

      for (const skuInput of skuInputs) {
        if (!skuInput.sizeLabel) continue;

        // normaliza: trim + upper
        const normalized = skuInput.sizeLabel.toString().trim().toUpperCase();

        if (!normalized) {
          skuInput.sizeLabel = undefined;
          continue;
        }

        skuInput.sizeLabel = normalized;

        if (seenSizes.has(normalized)) {
          this.logger.warn(
            {
              productId,
              vtexSkuId: skuInput.vtexSkuId,
              sizeLabelNormalized: normalized,
            },
            'Duplicate size label for product; TikTok payload will normalize values per SKU',
          );
        } else {
          seenSizes.add(normalized);
        }
      }

      const hasAvailableStock = skuInputs.some(
        (skuInput) => Number(skuInput.quantity ?? 0) > 0,
      );

      if (!allowZeroStock && !hasAvailableStock) {
        for (const skuInput of skuInputs) {
          processedSkuIds.add(skuInput.vtexSkuId);
        }

        this.logger.info(
          {
            shopId,
            productId,
          },
          'Skipping product sync because all SKUs have zero inventory',
        );

        return {
          processedSkus: skuInputs.length,
          syncedSkus: 0,
          errors,
        };
      }

      const categoryFromMappings =
        effectiveMappings.find((mapping) => mapping.ttsCategoryId)?.ttsCategoryId ?? null;
      let resolvedCategoryId = categoryFromMappings;
      let categorySource = categoryFromMappings ? 'mapping' : 'fallback';

      if (!resolvedCategoryId) {
        const categoryResolution = await this.categoryMappingService.resolveCategory(
          product,
          shopId,
        );
        resolvedCategoryId = categoryResolution.categoryId;
        categorySource = categoryResolution.source;
      }

      if (!resolvedCategoryId) {
        throw new Error(`Unable to determine TikTok category for product ${productId}`);
      }

      const productInput: TiktokProductInput = {
        product,
        skus: skuInputs,
      };

      this.logger.debug(
        {
          productId,
          vtexCategoryId: product.CategoryId,
          resolvedCategoryId,
          categorySource,
        },
        'Resolved TikTok category for product sync',
      );

      /**
       * 4) Decidir entre criar ou atualizar produto no TikTok.
       *    Se existingProductId for null, criamos um novo produto;
       *    caso contrário, atualizamos o produto existente.
       */
      const baseCreateOptions = {
        categoryId: resolvedCategoryId ?? undefined,
      };

      let response: TiktokProductResponse;

      try {
        response = existingProductId
          ? await this.tiktokClient.updateProduct(
              shopId,
              existingProductId,
              productInput,
              baseCreateOptions,
            )
          : await this.tiktokClient.createProduct(shopId, productInput, baseCreateOptions);
      } catch (error) {
        if (existingProductId && this.isTikTokProductStatusInvalid(error)) {
          this.logger.warn(
            {
              shopId,
              productId,
              existingProductId,
              relatedSkuIds,
              err: error instanceof Error ? error.message : error,
            },
            'TikTok rejected update due to product status; recreating product',
          );

          await this.prisma.productMap.updateMany({
            where: {
              shopId,
              vtexSkuId: { in: relatedSkuIds },
            },
            data: {
              status: 'pending',
              lastError: null,
              ttsProductId: null,
              ttsSkuId: null,
              ttsCategoryId: null,
            } as any,
          });

          existingProductId = null;
          const recreateSuffix = this.generateRecreateSuffix(productId);
          this.applySellerSkuOverride(skuInputs, recreateSuffix);
          response = await this.tiktokClient.createProduct(shopId, productInput, {
            ...baseCreateOptions,
            idempotencyKeySuffix: recreateSuffix,
            externalSkuIdSuffix: recreateSuffix,
          });
        } else if (this.isTikTokExternalIdDuplicate(error)) {
          const duplicateSuffix = this.generateRecreateSuffix(productId);
          this.logger.warn(
            {
              shopId,
              productId,
              relatedSkuIds,
              err: error instanceof Error ? error.message : error,
            },
            'TikTok reported duplicate external_id; regenerating sellerSkus and retrying',
          );
          this.applySellerSkuOverride(skuInputs, duplicateSuffix);
          response = await this.tiktokClient.createProduct(shopId, productInput, {
            ...baseCreateOptions,
            idempotencyKeySuffix: duplicateSuffix,
            externalSkuIdSuffix: duplicateSuffix,
          });
        } else {
          throw error;
        }
      }

      const targetProductId =
        response.productId ?? existingProductId ?? null;

      let syncedSkus = 0;

      for (const skuInput of skuInputs) {
        const sellerSkuKey =
          (skuInput.sellerSkuOverride ?? skuInput.vtexSkuId).toString();
        const mappedSkuId =
          response.skuIds[sellerSkuKey] ??
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
            ttsCategoryId: resolvedCategoryId,
          } as any,
          create: {
            vtexSkuId: skuInput.vtexSkuId,
            shopId,
            status: 'synced',
            ttsProductId: targetProductId,
            ttsSkuId: mappedSkuId,
            ttsCategoryId: resolvedCategoryId,
          } as any,
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

        if (targetProductId && mappedSkuId) {
          await this.syncInventoryForSku(
            shopId,
            skuInput.vtexSkuId,
            mappedSkuId,
            targetProductId,
            skuInput.quantity,
            vtexWarehouseId,
          );
        }
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

  async syncProduct(
    shopId: string,
    productId: string,
    options: { allowZeroStock?: boolean } = {},
  ) {
    const skuIds = await this.getSkuIdsForProduct(shopId, productId);
    if (!skuIds.length) {
      throw new Error(`No VTEX SKUs found for product ${productId}`);
    }
    const result = await this.syncProductBySku(
      shopId,
      skuIds[0],
      new Set<string>(),
      this.MAX_SKUS_PER_RUN,
      true,
      options.allowZeroStock ?? false,
    );
    return result;
  }

  async syncProductBySkuId(
    shopId: string,
    vtexSkuId: string,
    options: { allowZeroStock?: boolean } = {},
  ) {
    const result = await this.syncProductBySku(
      shopId,
      vtexSkuId,
      new Set<string>(),
      this.MAX_SKUS_PER_RUN,
      true,
      options.allowZeroStock ?? false,
    );
    return result;
  }

  private extractProductId(sku: VtexSkuSummary): string | null {
    const productId =
      sku?.ProductId ??
      sku?.productId ??
      (sku as any)?.ParentProductId ??
      null;
    return productId ? String(productId) : null;
  }

  private async getSkuIdsForProduct(
    shopId: string,
    productId: string,
    fallbackSkuId?: string,
  ): Promise<string[]> {
    const cached = this.productSkuCache.get(productId);
    if (cached && cached.length) {
      if (fallbackSkuId && !cached.includes(fallbackSkuId)) {
        const updated = Array.from(new Set([...cached, fallbackSkuId].map(String)));
        this.productSkuCache.set(productId, updated);
        return updated;
      }
      return cached;
    }

    let relatedSkuIds: string[] = [];

    try {
      const productSkusPayload = await this.vtexClient.getProductWithSkus(shopId, productId);
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
        const searchPayload = await this.vtexClient.searchProductWithItems(shopId, productId);
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

    if (fallbackSkuId && !relatedSkuIds.includes(fallbackSkuId)) {
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

  private deriveSizeLabel(product: VtexProduct, sku: VtexSkuSummary): string | undefined {
    const productName = (product.Name ?? '').toString().trim().toLowerCase();
    const rawSkuName = (sku.Name ?? sku.name ?? (sku as any).NameComplete ?? '')
      .toString().trim();

    let candidate = rawSkuName;
    // remover o nome do produto do início, se existir
    if (productName && rawSkuName.toLowerCase().startsWith(productName)) {
      candidate = rawSkuName.slice(productName.length).trim();
    }

    const fromCandidate =
      this.extractSizeToken(candidate) ?? this.extractSizeToken(rawSkuName);
    if (fromCandidate) {
      return fromCandidate;
    }

    // fallback: procurar no refId
    const refId = (sku as any).RefId ?? (sku as any).refId;
    if (typeof refId === 'string') {
      const fromRef = this.extractSizeToken(refId);
      if (fromRef) {
        return fromRef;
      }
    }
    return undefined;
  }

  private extractSizeToken(value: string): string | undefined {
    const normalized = value.toString().trim().toUpperCase();
    if (!normalized) {
      return undefined;
    }

    const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      const token = tokens[i];
      if (this.isSizeToken(token)) {
        return token;
      }
    }

    const suffixMatch = normalized.match(/(PP|GG|EG|XG|XXG|XGG|P|M|G|\d{1,3})$/);
    if (suffixMatch) {
      return suffixMatch[1];
    }

    return undefined;
  }

  private isSizeToken(token: string): boolean {
    if (/^\d{1,3}$/.test(token)) {
      return true;
    }
    return ['PP', 'P', 'M', 'G', 'GG', 'EG', 'XG', 'XXG', 'XGG'].includes(token);
  }

  private async fetchImagesSafely(
    shopId: string,
    skuId: string,
  ): Promise<VtexSkuImage[]> {
    try {
      return await this.vtexClient.getSkuImages(shopId, String(skuId));
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

  private async syncInventoryForSku(
    shopId: string,
    vtexSkuId: string,
    ttsSkuId: string,
    ttsProductId: string,
    quantity: number,
    warehouseId: string,
  ): Promise<void> {
    try {
      await this.tiktokClient.updateStock(
        shopId,
        warehouseId,
        ttsSkuId,
        Number.isFinite(quantity) ? quantity : 0,
        ttsProductId,
      );
      this.logger.info(
        { shopId, vtexSkuId, ttsSkuId, ttsProductId, quantity },
        'Synced inventory to TikTok after catalog sync',
      );
    } catch (error) {
      this.logger.error(
        {
          shopId,
          vtexSkuId,
          ttsSkuId,
          ttsProductId,
          quantity,
          err: error,
        },
        'Failed to sync inventory to TikTok after catalog sync',
      );
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

  private isTikTokProductStatusInvalid(error: unknown): boolean {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return Number((error as any).code) === 12052901;
    }
    if (error instanceof Error && error.message) {
      return error.message.includes('12052901');
    }
    return false;
  }

  private isTikTokExternalIdDuplicate(error: unknown): boolean {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return Number((error as any).code) === 12052996;
    }
    if (error instanceof Error && error.message) {
      return error.message.includes('12052996');
    }
    return false;
  }

  private generateRecreateSuffix(productId: string | number): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `recreate-${productId}-${Date.now()}-${random}`;
  }

  private applySellerSkuOverride(
    skuInputs: TiktokProductSkuInput[],
    suffix: string,
  ) {
    for (const skuInput of skuInputs) {
      skuInput.sellerSkuOverride = `${skuInput.vtexSkuId}-${suffix}`;
    }
  }
}
