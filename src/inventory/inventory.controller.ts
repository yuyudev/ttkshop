import { BadRequestException, Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiSecurity } from '@nestjs/swagger';

import { ApiKeyAuthGuard } from '../auth/auth.guard';
import { InventoryService } from './inventory.service';
import { InventorySyncDto, ZodValidationPipe, inventorySyncSchema } from '../common/dto';

@ApiSecurity('middlewareApiKey')
@ApiHeader({
  name: 'x-api-key',
  required: true,
  description: 'Chave interna do middleware para autorizar o acesso às rotas',
})
@UseGuards(ApiKeyAuthGuard)
@Controller('internal/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('sync')
  async manualSync(
    @Headers('x-tts-shopid') shopId: string,
    @Body(new ZodValidationPipe<InventorySyncDto>(inventorySyncSchema))
    payload: InventorySyncDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('Missing x-tts-shopid header');
    }
    return this.inventoryService.syncInventory(shopId, payload);
  }
}
