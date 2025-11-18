import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { VtexProduct } from './vtex-catalog.client';
import { CategoryAiService } from './category-ai.service';

type CategoryResolutionSource = 'mapping' | 'ai' | 'fallback';

export interface CategoryResolution {
  categoryId: string;
  source: CategoryResolutionSource;
}

@Injectable()
export class CategoryMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly aiService: CategoryAiService,
  ) {
    this.logger.setContext(CategoryMappingService.name);
  }

  async resolveCategory(product: VtexProduct): Promise<CategoryResolution> {
    const fallbackCategoryId = this.configService.get<string>('TIKTOK_DEFAULT_CATEGORY_ID', {
      infer: true,
    });

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

    const mapping = await categoryMapClient.findUnique({
      where: { vtexCategoryId },
    });

    if (mapping) {
      return { categoryId: mapping.tiktokCategoryId, source: 'mapping' };
    }

    const aiResult = await this.aiService.suggestCategory(product);
    if (aiResult.categoryId) {
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
