"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CategoryAiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryAiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const nestjs_pino_1 = require("nestjs-pino");
const prisma_service_1 = require("../prisma/prisma.service");
let CategoryAiService = CategoryAiService_1 = class CategoryAiService {
    constructor(configService, http, prisma, logger) {
        this.configService = configService;
        this.http = http;
        this.prisma = prisma;
        this.logger = logger;
        this.apiKey = this.configService.get('OPENAI_API_KEY', { infer: true }) ?? null;
        this.apiBase =
            this.configService.get('OPENAI_BASE_URL', { infer: true }) ??
                'https://api.openai.com/v1';
        this.model = this.configService.get('OPENAI_MODEL', { infer: true }) ?? 'gpt-5';
        this.logger.setContext(CategoryAiService_1.name);
    }
    async suggestCategory(product) {
        if (!this.apiKey) {
            this.logger.warn('OPENAI_API_KEY not configured; skipping AI categorization');
            return { categoryId: null };
        }
        const candidates = await this.findCandidateCategories(product);
        if (!candidates.length) {
            this.logger.warn({ vtexProductId: product.Id }, 'No TikTok category candidates found; skipping AI categorization');
            return { categoryId: null };
        }
        const prompt = this.buildPrompt(product, candidates);
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.http.post(`${this.apiBase}/chat/completions`, {
                model: this.model,
                temperature: 1,
                max_completion_tokens: 400,
                messages: [
                    {
                        role: 'system',
                        content: 'Você é um assistente de catalogação que escolhe a melhor categoria do TikTok Shop com base nas opções fornecidas. Responda sempre com JSON válido no formato {"category_id": "...", "confidence": number, "reason": "..."}. Se nenhuma categoria fizer sentido, retorne {"category_id": null}. Nunca inclua texto fora do JSON.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }));
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('OpenAI response did not include message content');
            }
            let parsed;
            try {
                parsed = JSON.parse(content.trim());
            }
            catch (parseError) {
                this.logger.error({ vtexProductId: product.Id, content }, 'Failed to parse GPT response; returning null category');
                return { categoryId: null };
            }
            const result = {
                categoryId: parsed.category_id,
                confidence: parsed.confidence,
                reasoning: parsed.reason,
            };
            this.logger.info({
                vtexProductId: product.Id,
                categoryId: result.categoryId,
                confidence: result.confidence,
            }, 'AI category classification succeeded');
            return result;
        }
        catch (error) {
            const responseData = error?.response?.data;
            this.logger.error({ err: error, responseData, vtexProductId: product.Id }, 'Failed to classify category via GPT');
            return { categoryId: null };
        }
    }
    async findCandidateCategories(product) {
        const terms = this.buildSearchTerms(product);
        const where = terms.length
            ? {
                isLeaf: true,
                OR: terms.map((term) => ({
                    name: { contains: term, mode: 'insensitive' },
                })),
            }
            : { isLeaf: true };
        const categories = await this.prisma.tiktokCategory.findMany({
            where,
            orderBy: { level: 'asc' },
            take: 12,
        });
        if (!categories.length) {
            const fallback = await this.prisma.tiktokCategory.findMany({
                where: { isLeaf: true },
                orderBy: { level: 'asc' },
                take: 12,
            });
            return fallback.map((cat) => ({ id: cat.id, name: cat.name, fullPath: cat.fullPath }));
        }
        return categories.map((cat) => ({ id: cat.id, name: cat.name, fullPath: cat.fullPath }));
    }
    buildSearchTerms(product) {
        const terms = new Set();
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
    buildPrompt(product, candidates) {
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
            instructions: 'Escolha o id da categoria mais apropriada. Considere a árvore completa fornecida em fullPath. Responda apenas com JSON conforme instruído.',
        };
        return JSON.stringify(payload);
    }
};
exports.CategoryAiService = CategoryAiService;
exports.CategoryAiService = CategoryAiService = CategoryAiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService,
        prisma_service_1.PrismaService,
        nestjs_pino_1.PinoLogger])
], CategoryAiService);
//# sourceMappingURL=category-ai.service.js.map