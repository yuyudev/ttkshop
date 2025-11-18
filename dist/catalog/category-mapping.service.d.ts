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
export declare class CategoryMappingService {
    private readonly prisma;
    private readonly configService;
    private readonly logger;
    private readonly aiService;
    constructor(prisma: PrismaService, configService: ConfigService, logger: PinoLogger, aiService: CategoryAiService);
    resolveCategory(product: VtexProduct): Promise<CategoryResolution>;
    private extractVtexCategoryId;
}
export {};
