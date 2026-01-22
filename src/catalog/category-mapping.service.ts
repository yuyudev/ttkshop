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
    private readonly shopConfigService: ShopConfigService,
  ) {
    this.logger.setContext(CategoryMappingService.name);
  }

  async resolveCategory(product: VtexProduct, shopId: string): Promise<CategoryResolution> {
    const fallbackCategoryId = await this.shopConfigService.getTiktokDefaultCategoryId(shopId);

    const vtexCategoryId = this.extractVtexCategoryId(product);
    const categoryMapClient = (this.prisma as any)?.vtexCategoryMap;

    if (vtexCategoryId) {
      if (!categoryMapClient) {
        throw new Error(
          'Prisma client is missing VtexCategoryMap model. Run `npx prisma generate` after updating the schema.',
        );
      }

      const mapping = await categoryMapClient.findUnique({
        where: { vtexCategoryId },
      });

      if (mapping) {
        return { categoryId: mapping.tiktokCategoryId, source: 'mapping' };
      }
    }

    const aiResult = await this.aiService.suggestCategory(product);
    if (aiResult.categoryId) {
      if (vtexCategoryId && categoryMapClient) {
        await categoryMapClient.upsert({
          where: { vtexCategoryId },
          update: {
            tiktokCategoryId: aiResult.categoryId,
            confidence: aiResult.confidence,
            notes: aiResult.reasoning,
          },
          create: {
            vtexCategoryId,
            tiktokCategoryId: aiResult.categoryId,
            confidence: aiResult.confidence,
            notes: aiResult.reasoning,
          },
        });
      }

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
        `Unable to resolve TikTok category for product ${product.Id}: configure TIKTOK_DEFAULT_CATEGORY_ID in the shop config or provide a mapping`,
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
