import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { VtexProduct } from './vtex-catalog.client';
import { CategoryAiService } from './category-ai.service';
import { ShopConfigService } from '../common/shop-config.service';

type CategoryResolutionSource = 'mapping' | 'ai' | 'fallback';

export interface CategoryResolution {
  categoryId: string;
  source: CategoryResolutionSource;
}

@Injectable()
export class CategoryMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly aiService: CategoryAiService,
    private readonly shopConfig: ShopConfigService,
  ) {
    this.logger.setContext(CategoryMappingService.name);
  }

  async resolveCategory(shopId: string, product: VtexProduct): Promise<CategoryResolution> {
    const fallbackCategoryId = await this.shopConfig.resolveTiktokDefaultCategoryId(shopId);

    const vtexCategoryId = this.extractVtexCategoryId(product);
    if (!vtexCategoryId) {
      if (!fallbackCategoryId) {
        throw new Error(
          `Unable to resolve TikTok category for product ${product.Id}: missing VTEX category and fallback`,
        );
      }
      return { categoryId: fallbackCategoryId, source: 'fallback' };
    }

    const categoryMapClient = (this.prisma as any)?.vtexCategoryMap;
    if (!categoryMapClient) {
      throw new Error(
        'Prisma client is missing VtexCategoryMap model. Run `npx prisma generate` after updating the schema.',
      );
    }

    let mapping = await categoryMapClient.findUnique({
      where: {
        shopId_vtexCategoryId: {
          shopId,
          vtexCategoryId,
        },
      },
    });

    if (!mapping) {
      const legacyMapping = await categoryMapClient.findFirst({
        where: {
          vtexCategoryId,
          shopId: null,
        },
      });
      if (legacyMapping) {
        try {
          await categoryMapClient.update({
            where: { id: legacyMapping.id },
            data: { shopId },
          });
          mapping = { ...legacyMapping, shopId };
        } catch (error) {
          this.logger.warn(
            { err: error, shopId, vtexCategoryId },
            'Failed to backfill legacy category mapping with shopId',
          );
          mapping = legacyMapping;
        }
      }
    }

    if (mapping) {
      return { categoryId: mapping.tiktokCategoryId, source: 'mapping' };
    }

    const aiResult = await this.aiService.suggestCategory(product);
    if (aiResult.categoryId) {
      await categoryMapClient.upsert({
        where: {
          shopId_vtexCategoryId: {
            shopId,
            vtexCategoryId,
          },
        },
        update: {
          tiktokCategoryId: aiResult.categoryId,
          confidence: aiResult.confidence,
          notes: aiResult.reasoning,
        },
        create: {
          vtexCategoryId,
          shopId,
          tiktokCategoryId: aiResult.categoryId,
          confidence: aiResult.confidence,
          notes: aiResult.reasoning,
        },
      });

      return { categoryId: aiResult.categoryId, source: 'ai' };
    }

    if (!fallbackCategoryId) {
      this.logger.error(
        {
          productId: product.Id,
          vtexCategoryId,
        },
        'Unable to find TikTok category mapping and fallback is not configured',
      );
      throw new Error(
        `Unable to resolve TikTok category for product ${product.Id}: configure TIKTOK_DEFAULT_CATEGORY_ID or provide a mapping`,
      );
    }

    return { categoryId: fallbackCategoryId, source: 'fallback' };
  }

  private extractVtexCategoryId(product: VtexProduct): string | null {
    const categoryId =
      product?.CategoryId ??
      (product as any)?.categoryId ??
      (product as any)?.DepartmentId ??
      null;
    if (!categoryId) {
      return null;
    }
    const normalized = String(categoryId).trim();
    return normalized || null;
  }
}
