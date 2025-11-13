import { BadRequestException, Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiSecurity } from '@nestjs/swagger';

import { ApiKeyAuthGuard } from '../auth/auth.guard';
import { CatalogService } from './catalog.service';
import { CatalogSyncDto, ZodValidationPipe, catalogSyncSchema } from '../common/dto';

@ApiSecurity('middlewareApiKey')
@ApiHeader({
  name: 'x-api-key',
  required: true,
  description: 'Chave interna do middleware para autorizar o acesso às rotas',
})
@UseGuards(ApiKeyAuthGuard)
@Controller('internal/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('sync')
  async syncCatalog(
    @Headers('x-tts-shopid') shopId: string,
    @Body(new ZodValidationPipe<CatalogSyncDto>(catalogSyncSchema))
    payload: CatalogSyncDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('Missing x-tts-shopid header');
    }
    return this.catalogService.syncCatalog(shopId, payload);
  }
}
