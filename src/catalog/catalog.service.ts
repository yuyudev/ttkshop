import { Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';

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
    private readonly configService: ConfigService, 
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

      const sku = await this.vtexClient.getSkuById(skuId);
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

      /**
       * 1) Buscar mappings existentes (VTEX SKU -> TikTok product/sku)
       *    Já filtrando por shopId para evitar sujeira de outras lojas.
       */
      const mappings = await this.prisma.productMap.findMany({
        where: {
          shopId,
          vtexSkuId: { in: relatedSkuIds },
        },
      });

      /**
       * 2) Descobrir quais productIds do TikTok existem para esse conjunto de SKUs.
       *    Se tiver mais de um, isso está inconsistente: vamos resetar tudo
       *    e tratar como produto novo no TikTok.
       */
      const distinctProductIds: string[] = Array.from(
        new Set(
          mappings
            .map((m) => m.ttsProductId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      let existingProductId: string | null = null;
      let effectiveMappings = mappings;

      if (distinctProductIds.length === 1) {
        existingProductId = distinctProductIds[0];

        // por segurança, filtra apenas mappings que apontam para esse productId
        effectiveMappings = mappings.filter(
          (m) => m.ttsProductId === existingProductId,
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
          },
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
      const mappingBySkuId = new Map(
        effectiveMappings.map((mapping) => [mapping.vtexSkuId, mapping]),
      );

      const skuInputs: TiktokProductSkuInput[] = [];

      for (const skuId of relatedSkuIds) {
        const skuDetails =
          skuId === vtexSkuId ? sku : await this.vtexClient.getSkuById(skuId);

        const price = await this.vtexClient.getPrice(skuId);
        const images = await this.fetchImagesSafely(skuId);

        const warehouseId =
          this.configService.get<string>('VTEX_WAREHOUSE_ID', { infer: true }) ?? '1_1';

        const quantity = await this.vtexClient.getSkuInventory(skuId, warehouseId);

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

      // Normalizar e deduplicar labels de tamanho por produto
      const seenSizes = new Set<string>();

      for (const skuInput of skuInputs) {
        if (!skuInput.sizeLabel) continue;

        // normaliza: trim + upper
        const normalized = skuInput.sizeLabel.toString().trim().toUpperCase();

        if (!normalized) {
          skuInput.sizeLabel = undefined;
          continue;
        }

        if (seenSizes.has(normalized)) {
          // Já temos um SKU com esse tamanho para este produto.
          // Para evitar o erro 12052251, removemos o atributo de venda desta duplicata.
          this.logger.warn(
            {
              productId,
              vtexSkuId: skuInput.vtexSkuId,
              sizeLabelOriginal: skuInput.sizeLabel,
              sizeLabelNormalized: normalized,
            },
            'Duplicate size label for product; clearing sales attribute to avoid TikTok error 12052251',
          );

          skuInput.sizeLabel = undefined;
        } else {
          skuInput.sizeLabel = normalized;
          seenSizes.add(normalized);
        }
      }

      const productInput: TiktokProductInput = {
        product,
        skus: skuInputs,
      };

      /**
       * 4) Decidir entre criar ou atualizar produto no TikTok.
       *    Se existingProductId for null, criamos um novo produto;
       *    caso contrário, atualizamos o produto existente.
       */
      const response = existingProductId
        ? await this.tiktokClient.updateProduct(shopId, existingProductId, productInput)
        : await this.tiktokClient.createProduct(shopId, productInput);

      const targetProductId =
        response.productId ?? existingProductId ?? null;

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

  async syncProduct(shopId: string, productId: string) {
    const skuIds = await this.getSkuIdsForProduct(productId, productId);
    const result = await this.syncProductBySku(
      shopId,
      skuIds[0],
      new Set<string>(),
      this.MAX_SKUS_PER_RUN,
      true,
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

  private deriveSizeLabel(product: VtexProduct, sku: VtexSkuSummary): string | undefined {
    const productName = (product.Name ?? '').toString().trim().toLowerCase();
    const rawSkuName = (sku.Name ?? sku.name ?? (sku as any).NameComplete ?? '')
      .toString().trim();

    let suffix = '';
    // remover o nome do produto do início, se existir
    if (productName && rawSkuName.toLowerCase().startsWith(productName)) {
      suffix = rawSkuName.slice(productName.length).trim();
    } else {
      // caso contrário, usar a última palavra
      const parts = rawSkuName.split(/\s+/);
      suffix = parts[parts.length - 1] ?? '';
    }

    // aceitar apenas números (1 a 3 dígitos) ou siglas PP/P/M/G/GG
    const match = suffix.match(/^(pp|p|m|g|gg|\d{1,3})$/i);
    if (match) {
      return match[1].toUpperCase();
    }

    // fallback: último segmento numérico do refId
    const refId = (sku as any).RefId ?? (sku as any).refId;
    if (typeof refId === 'string') {
      const refParts = refId.split(/[_-]/).map((p) => p.trim()).filter(Boolean);
      const last = refParts[refParts.length - 1];
      if (last && /^[0-9]{1,3}$/i.test(last)) {
        return last;
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
