import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config';
import {
  TikTokCallbackQuery,
  ZodValidationPipe,
  tikTokCallbackQuerySchema,
} from '../common/dto';
import { TiktokShopService } from './tiktokshop.service';

@Controller('oauth/tiktokshop')
export class TiktokShopController {
  constructor(
    private readonly tiktokShopService: TiktokShopService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TiktokShopController.name);
  }

  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query(new ZodValidationPipe<TikTokCallbackQuery>(tikTokCallbackQuerySchema))
    query: TikTokCallbackQuery,
  ) {
    try {
      const code = query.auth_code ?? query.code!;
      const shopId = this.resolveShopId(query);

      const result = await this.tiktokShopService.exchangeAuthorizationCode(code, shopId);
      const publicBaseUrl = this.configService.getOrThrow<string>('PUBLIC_BASE_URL', {
        infer: true,
      });

      this.logger.info({ shopId: result.shopId }, 'TikTok authorization completed');

      if (publicBaseUrl) {
        const redirectUrl = new URL(publicBaseUrl);
        const successPath = this.configService.getOrThrow<string>('TTS_REDIRECT_PATH', {
          infer: true,
        });
        redirectUrl.pathname = successPath.endsWith('/success')
          ? successPath
          : `${successPath.replace(/\/$/, '')}/success`;
        return res.redirect(302, redirectUrl.toString());
      }

      return res.json({
        message: 'Autorização concluída',
        shopId: result.shopId,
      });
    } catch (err) {
      this.logger.error({ err }, 'Failed to exchange TikTok authorization code');
      return res.status(500).json({
        message: 'Erro ao trocar código por token TikTok',
      });
    }
  }

  private resolveShopId(query: TikTokCallbackQuery): string | undefined {
    if (query.shop_id) {
      return query.shop_id;
    }
    if (!query.state) {
      return undefined;
    }

    try {
      const decoded = Buffer.from(query.state, 'base64').toString('utf8');
      const payload = JSON.parse(decoded) as { shopId?: string };
      return payload.shopId;
    } catch (error) {
      this.logger.warn({ err: error }, 'Failed to parse state payload for shop id');
      return undefined;
    }
  }
}
