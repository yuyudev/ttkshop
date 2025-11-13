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
  constructor(
    private readonly vtexClient: VtexCatalogClient,
    private readonly tiktokClient: TiktokProductClient,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CatalogService.name);
  }

  async syncCatalog(shopId: string, input: CatalogSyncDto) {
    const skuSummaries = await this.vtexClient.listSkus(input.updatedFrom);

    let processed = 0;
    let synced = 0;
    const errors: Record<string, string> = {};

    for (const summary of skuSummaries) {
      processed += 1;
      try {
        const sku = await this.vtexClient.getSkuById(summary.id);
        const productId = sku?.ProductId ?? sku?.productId ?? sku?.ParentProductId;
        if (!productId) {
          throw new Error('VTEX SKU did not include productId');
        }
        const product = await this.vtexClient.getProductById(String(productId));
        const price = await this.vtexClient.getPrice(summary.id);
        const images = await this.fetchImagesSafely(summary.id);
        const quantity = sku.StockBalance ?? sku.stockBalance ?? 0;

        const productInput: TiktokProductInput = {
          vtexSkuId: summary.id,
          sku,
          product,
          price,
          quantity,
          images,
        };

        const mapping = await this.prisma.productMap.findUnique({
          where: { vtexSkuId: summary.id },
        });

        let ttsSkuId = mapping?.ttsSkuId ?? null;
        let ttsProductId = mapping?.ttsProductId ?? null;

        if (!mapping?.ttsProductId) {
          const response = await this.tiktokClient.createProduct(shopId, productInput);
          ({ productId: ttsProductId, skuId: ttsSkuId } = this.extractIdentifiers(response));

          await this.prisma.productMap.upsert({
            where: { vtexSkuId: summary.id },
            update: {
              status: 'synced',
              lastError: null,
              ttsProductId,
              ttsSkuId,
              shopId,
            },
            create: {
              vtexSkuId: summary.id,
              shopId,
              status: 'synced',
              ttsProductId,
              ttsSkuId,
            },
          });
        } else {
          const response = await this.tiktokClient.updateProduct(
            shopId,
            mapping.ttsProductId,
            productInput,
          );
          const identifiers = this.extractIdentifiers(response);
          ttsProductId = identifiers.productId ?? mapping.ttsProductId;
          ttsSkuId = identifiers.skuId ?? mapping.ttsSkuId;

          await this.prisma.productMap.update({
            where: { vtexSkuId: summary.id },
            data: {
              status: 'synced',
              lastError: null,
              shopId,
              ttsProductId,
              ttsSkuId,
            },
          });
        }

        synced += 1;
      } catch (error) {
        const errorPayload = isAxiosError(error) ? error.response?.data : undefined;
        const message =
          errorPayload !== undefined
            ? JSON.stringify(errorPayload)
            : error instanceof Error
            ? error.message
            : 'Unknown error';
        this.logger.error({ err: error, skuId: summary.id, errorPayload }, 'Failed to sync SKU');

          await this.prisma.productMap.upsert({
            where: { vtexSkuId: summary.id },
            update: {
              status: 'error',
              lastError: message,
            shopId,
          },
          create: {
            vtexSkuId: summary.id,
            shopId,
            status: 'error',
            lastError: message,
          },
        });

        errors[summary.id] = message;
      }
    }

    return {
      processed,
      synced,
      failed: processed - synced,
      errors,
    };
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
