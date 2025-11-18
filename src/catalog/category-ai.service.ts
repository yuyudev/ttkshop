import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { VtexProduct } from './vtex-catalog.client';

interface CandidateCategory {
  id: string;
  name: string;
  fullPath: string | null;
}

export interface AiCategoryResult {
  categoryId: string | null;
  confidence?: number;
  reasoning?: string;
}

interface OpenAiResponse {
  category_id: string | null;
  confidence?: number;
  reason?: string;
}

@Injectable()
export class CategoryAiService {
  private readonly apiKey: string | null;
  private readonly apiBase: string;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY', { infer: true }) ?? null;
    this.apiBase =
      this.configService.get<string>('OPENAI_BASE_URL', { infer: true }) ??
      'https://api.openai.com/v1';
    this.model = this.configService.get<string>('OPENAI_MODEL', { infer: true }) ?? 'gpt-5';
    this.logger.setContext(CategoryAiService.name);
  }

  async suggestCategory(product: VtexProduct): Promise<AiCategoryResult> {
    if (!this.apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured; skipping AI categorization');
      return { categoryId: null };
    }

    const candidates = await this.findCandidateCategories(product);
    if (!candidates.length) {
      this.logger.warn(
        { vtexProductId: product.Id },
        'No TikTok category candidates found; skipping AI categorization',
      );
      return { categoryId: null };
    }

    const prompt = this.buildPrompt(product, candidates);

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.apiBase}/chat/completions`,
          {
            model: this.model,
            temperature: 1,
            max_completion_tokens: 400,
            messages: [
              {
                role: 'system',
                content:
                  'Você é um assistente de catalogação que escolhe a melhor categoria do TikTok Shop com base nas opções fornecidas. Responda sempre com JSON válido no formato {"category_id": "...", "confidence": number, "reason": "..."}. Se nenhuma categoria fizer sentido, retorne {"category_id": null}. Nunca inclua texto fora do JSON.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI response did not include message content');
      }

      let parsed: OpenAiResponse;
      try {
        parsed = JSON.parse(content.trim());
      } catch (parseError) {
        this.logger.error(
          { vtexProductId: product.Id, content },
          'Failed to parse GPT response; returning null category',
        );
        return { categoryId: null };
      }
      const result: AiCategoryResult = {
        categoryId: parsed.category_id,
        confidence: parsed.confidence,
        reasoning: parsed.reason,
      };
      this.logger.info(
        {
          vtexProductId: product.Id,
          categoryId: result.categoryId,
          confidence: result.confidence,
        },
        'AI category classification succeeded',
      );
      return result;
    } catch (error) {
      const responseData = (error as any)?.response?.data;
      this.logger.error(
        { err: error, responseData, vtexProductId: product.Id },
        'Failed to classify category via GPT',
      );
      return { categoryId: null };
    }
  }

  private async findCandidateCategories(product: VtexProduct): Promise<CandidateCategory[]> {
    const terms = this.buildSearchTerms(product);

    const where = terms.length
      ? {
          isLeaf: true,
          OR: terms.map((term) => ({
            name: { contains: term, mode: 'insensitive' as const },
          })),
        }
      : { isLeaf: true };

    const categories = await this.prisma.tiktokCategory.findMany({
      where,
      orderBy: { level: 'asc' },
      take: 12,
    });

    if (!categories.length) {
      // fallback to top leaves
      const fallback = await this.prisma.tiktokCategory.findMany({
        where: { isLeaf: true },
        orderBy: { level: 'asc' },
        take: 12,
      });
      return fallback.map((cat) => ({ id: cat.id, name: cat.name, fullPath: cat.fullPath }));
    }

    return categories.map((cat) => ({ id: cat.id, name: cat.name, fullPath: cat.fullPath }));
  }

  private buildSearchTerms(product: VtexProduct): string[] {
    const terms = new Set<string>();
    const name = (product.Name ?? '').toString();
    if (name) {
      name
        .split(/\W+/)
        .filter((part) => part.length > 3)
        .forEach((part) => terms.add(part));
      terms.add(name.trim());
    }
    if (product.CategoryId) {
      terms.add(String(product.CategoryId));
    }
    if (product.BrandName) {
      terms.add(product.BrandName);
    }
    return Array.from(terms).slice(0, 5);
  }

  private buildPrompt(product: VtexProduct, candidates: CandidateCategory[]): string {
    const payload = {
      product: {
        id: product.Id,
        name: product.Name,
        description: product.Description ?? product.MetaTagDescription,
        brand: product.BrandName,
        categoryId: product.CategoryId,
      },
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        fullPath: candidate.fullPath,
      })),
      instructions:
        'Escolha o id da categoria mais apropriada. Considere a árvore completa fornecida em fullPath. Responda apenas com JSON conforme instruído.',
    };
    return JSON.stringify(payload);
  }
}
