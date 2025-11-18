import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { VtexProduct } from './vtex-catalog.client';
export interface AiCategoryResult {
    categoryId: string | null;
    confidence?: number;
    reasoning?: string;
}
export declare class CategoryAiService {
    private readonly configService;
    private readonly http;
    private readonly prisma;
    private readonly logger;
    private readonly apiKey;
    private readonly apiBase;
    private readonly model;
    constructor(configService: ConfigService, http: HttpService, prisma: PrismaService, logger: PinoLogger);
    suggestCategory(product: VtexProduct): Promise<AiCategoryResult>;
    private findCandidateCategories;
    private buildSearchTerms;
    private buildPrompt;
}
