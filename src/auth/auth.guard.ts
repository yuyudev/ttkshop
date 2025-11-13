import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfig } from '../common/config';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headerKey = (request.headers['x-api-key'] as string | undefined) ?? request.headers['x-api_key'];
    const queryKey = request.query['apiKey'] as string | undefined;
    const provided = headerKey || queryKey;

    const expected = this.configService.getOrThrow<string>('MIDDLEWARE_API_KEY', { infer: true });

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
