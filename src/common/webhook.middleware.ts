import { createHmac } from 'crypto';
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

import { AppConfig } from './config';

@Injectable()
export class TiktokWebhookMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService<AppConfig>) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const signature = (req.headers['x-signature'] || req.headers['x-tt-signature']) as string | undefined;
    if (!signature) {
      throw new UnauthorizedException('Missing TikTok webhook signature header');
    }

    const secret = this.configService.getOrThrow<string>('TIKTOK_APP_SECRET', { infer: true });
    const rawBody = (req as any).rawBody;
    const payload =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});

    const computed = createHmac('sha256', secret).update(payload).digest('hex');

    if (computed !== signature) {
      throw new UnauthorizedException('Invalid TikTok webhook signature');
    }

    next();
  }
}
