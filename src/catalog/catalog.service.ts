import { Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { CatalogSyncDto } from '../common/dto';
import { VtexCatalogClient, VtexSkuImage } from './vtex-catalog.client';
import {
  TiktokProductClient,
  TiktokProductInput,
  TiktokProductResponse,
} from './tiktok-product.client';

@Injectable()
export class CatalogService {
  // limite de SKUs processados por execução para evitar timeout
  private readonly MAX_SKUS_PER_RUN = 50;

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

    for (const summary of skuSummaries) {
      if (processed >= this.MAX_SKUS_PER_RUN) {
        break;
      }

      processed += 1;

      const result = await this.syncSingleSku(shopId, summary.id);

      if (result.ok) {
        synced += 1;
        this.logger.info(
          {
            skuId: summary.id,
            ttsProductId: result.ttsProductId,
            ttsSkuId: result.ttsSkuId,
          },
          'Successfully synced SKU to TikTok',
        );
      } else if (result.errorMessage) {
        errors[summary.id] = result.errorMessage;
      }
    }

    const remaining = skuSummaries.length - processed;

    return {
      processed,
      synced,
      failed: processed - synced,
      remaining,
      errors,
    };
  }

  /**
   * Helper que sincroniza **um único SKU**.
   * - Ideal para o cron chamar sku a sku no futuro.
   * - Já atualiza o productMap e faz logs de sucesso/erro.
   */
  private async syncSingleSku(
    shopId: string,
    vtexSkuId: string,
  ): Promise<{
    ok: boolean;
    ttsProductId?: string | null;
    ttsSkuId?: string | null;
    errorMessage?: string;
  }> {
    try {
      const sku = await this.vtexClient.getSkuById(vtexSkuId);
      const productId =
        sku?.ProductId ?? sku?.productId ?? sku?.ParentProductId;
      if (!productId) {
        throw new Error('VTEX SKU did not include productId');
      }

      const product = await this.vtexClient.getProductById(String(productId));
      const price = await this.vtexClient.getPrice(vtexSkuId);
      const images = await this.fetchImagesSafely(vtexSkuId);
      const quantity = sku.StockBalance ?? sku.stockBalance ?? 0;

      const productInput: TiktokProductInput = {
        vtexSkuId,
        sku,
        product,
        price,
        quantity,
        images,
      };

      const mapping = await this.prisma.productMap.findUnique({
        where: { vtexSkuId },
      });

      let ttsSkuId = mapping?.ttsSkuId ?? null;
      let ttsProductId = mapping?.ttsProductId ?? null;

      let response: TiktokProductResponse;

      if (!mapping?.ttsProductId) {
        // criação de produto na TikTok
        response = await this.tiktokClient.createProduct(shopId, productInput);
        ({ productId: ttsProductId, skuId: ttsSkuId } =
          this.extractIdentifiers(response));

        if (!ttsProductId || !ttsSkuId) {
          throw new Error(
            `TikTok did not return product_id/sku_id for vtexSkuId=${vtexSkuId}`,
          );
        }

        await this.prisma.productMap.upsert({
          where: { vtexSkuId },
          update: {
            status: 'synced',
            lastError: null,
            ttsProductId,
            ttsSkuId,
            shopId,
          },
          create: {
            vtexSkuId,
            shopId,
            status: 'synced',
            ttsProductId,
            ttsSkuId,
          },
        });

        this.logger.info(
          { skuId: vtexSkuId, ttsProductId, ttsSkuId },
          'Successfully synced SKU to TikTok (create)',
        );
      } else {
        // atualização de produto existente na TikTok
        response = await this.tiktokClient.updateProduct(
          shopId,
          mapping.ttsProductId,
          productInput,
        );
        const identifiers = this.extractIdentifiers(response);
        ttsProductId = identifiers.productId ?? mapping.ttsProductId;
        ttsSkuId = identifiers.skuId ?? mapping.ttsSkuId;

        if (!identifiers.productId || !identifiers.skuId) {
          this.logger.warn(
            {
              skuId: vtexSkuId,
              raw: response.raw,
            },
            'TikTok updateProduct did not return product_id/sku_id, keeping existing mapping',
          );
        }

        await this.prisma.productMap.update({
          where: { vtexSkuId },
          data: {
            status: 'synced',
            lastError: null,
            shopId,
            ttsProductId,
            ttsSkuId,
          },
        });

        this.logger.info(
          { skuId: vtexSkuId, ttsProductId, ttsSkuId },
          'Successfully synced SKU to TikTok (update)',
        );
      }

      return {
        ok: true,
        ttsProductId,
        ttsSkuId,
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
        { err: error, skuId: vtexSkuId, errorPayload },
        'Failed to sync SKU',
      );

      await this.prisma.productMap.upsert({
        where: { vtexSkuId },
        update: {
          status: 'error',
          lastError: message,
          shopId,
        },
        create: {
          vtexSkuId,
          shopId,
          status: 'error',
          lastError: message,
        },
      });

      return {
        ok: false,
        errorMessage: message,
      };
    }
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

  private extractIdentifiers(response: TiktokProductResponse) {
    const rawData = response.raw as Record<string, any> | undefined;
    const productId =
      response.productId ??
      rawData?.data?.product_id ??
      rawData?.data?.product?.product_id ??
      rawData?.product_id ??
      null;
    const skuId =
      response.skuId ??
      rawData?.data?.skus?.[0]?.id ??
      rawData?.data?.sku_id ??
      rawData?.skus?.[0]?.id ??
      null;

    return { productId, skuId };
  }
}
