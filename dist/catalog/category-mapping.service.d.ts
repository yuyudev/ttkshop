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
export declare class CategoryMappingService {
    private readonly prisma;
    private readonly logger;
    private readonly aiService;
    private readonly shopConfigService;
    constructor(prisma: PrismaService, logger: PinoLogger, aiService: CategoryAiService, shopConfigService: ShopConfigService);
    resolveCategory(product: VtexProduct, shopId: string): Promise<CategoryResolution>;
    private extractVtexCategoryId;
}
export {};
