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
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) { }

  @UseGuards(ApiKeyAuthGuard)
  @Post('webhooks/vtex/inventory')
  async handleVtexWebhook(@Body() payload: any) {
    // Payload VTEX Broadcaster geralmente é { "IdSku": "123", "An": "...", ... }
    // Vamos aceitar genérico e processar no service
    return this.inventoryService.handleVtexWebhook(payload);
  }

  @UseGuards(ApiKeyAuthGuard)
  @Post('internal/inventory/sync')
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
