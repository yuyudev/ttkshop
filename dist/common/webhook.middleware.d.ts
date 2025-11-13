import { NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { AppConfig } from './config';
export declare class TiktokWebhookMiddleware implements NestMiddleware {
    private readonly configService;
    constructor(configService: ConfigService<AppConfig>);
    use(req: Request, res: Response, next: NextFunction): void;
}
