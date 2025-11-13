import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiSecurity } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';

import { ApiKeyAuthGuard } from '../auth/auth.guard';
import { CatalogService } from './catalog.service';
import {
  CatalogSyncDto,
  ZodValidationPipe,
  catalogSyncSchema,
} from '../common/dto';

@ApiSecurity('middlewareApiKey')
@ApiHeader({
  name: 'x-api-key',
  required: true,
  description: 'Chave interna do middleware para autorizar o acesso às rotas',
})
@UseGuards(ApiKeyAuthGuard)
@Controller('internal/catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CatalogController.name);
  }

  @Post('sync')
  async syncCatalog(
    @Headers('x-tts-shopid') shopId: string,
    @Body(new ZodValidationPipe<CatalogSyncDto>(catalogSyncSchema))
    payload: CatalogSyncDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('Missing x-tts-shopid header');
    }

    this.logger.info(
      { shopId, payload },
      'Starting catalog sync request',
    );

    const result = await this.catalogService.syncCatalog(shopId, payload);

    this.logger.info(
      {
        shopId,
        processed: result.processed,
        synced: result.synced,
        failed: result.failed,
        remaining: result.remaining,
      },
      'Finished catalog sync request',
    );

    return result;
  }
}
