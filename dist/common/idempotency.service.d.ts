import { PrismaService } from '../prisma/prisma.service';
export declare class IdempotencyService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    alreadyProcessed(key: string): Promise<boolean>;
    register<TPayload>(key: string, payload: TPayload, handler: () => Promise<void>): Promise<'skipped' | 'processed'>;
}
