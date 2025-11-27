import { createHmac } from 'crypto';
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

import { AppConfig } from './config';

@Injectable()
export class TiktokWebhookMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService<AppConfig>) { }

  use(req: Request, res: Response, next: NextFunction): void {
    const signature = (req.headers['x-signature'] || req.headers['x-tt-signature'] || req.headers['authorization']) as string | undefined;

    if (!signature) {
      throw new UnauthorizedException('Missing TikTok webhook signature header');
    }

    const secret = this.configService.getOrThrow<string>('TIKTOK_APP_SECRET', { infer: true });
    const appKey = this.configService.getOrThrow<string>('TIKTOK_APP_KEY', { infer: true });
    const rawBody = (req as any).rawBody;
    const payload =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body ?? {});

    // TikTok webhook signature = HMAC-SHA256(app_key + body, app_secret)
    const signatureBase = appKey + payload;
    const computed = createHmac('sha256', secret).update(signatureBase).digest('hex');

    if (computed !== signature) {
      throw new UnauthorizedException('Invalid TikTok webhook signature');
    }

    next();
  }
}
