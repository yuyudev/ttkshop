import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppConfig } from '../common/config';
import { TikTokCallbackQuery } from '../common/dto';
import { TiktokShopService } from './tiktokshop.service';
export declare class TiktokShopController {
    private readonly tiktokShopService;
    private readonly configService;
    private readonly logger;
    constructor(tiktokShopService: TiktokShopService, configService: ConfigService<AppConfig>, logger: PinoLogger);
    callback(res: Response, query: TikTokCallbackQuery): Promise<void | Response<any, Record<string, any>>>;
    private resolveShopId;
}
