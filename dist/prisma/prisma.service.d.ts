import { INestApplication, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
export declare class PrismaService extends PrismaClient implements OnModuleInit {
    private readonly logger;
    constructor(logger: PinoLogger);
    onModuleInit(): Promise<void>;
    enableShutdownHooks(app: INestApplication): Promise<void>;
}
