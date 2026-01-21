import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiSecurity } from '@nestjs/swagger';

import { ApiKeyAuthGuard } from '../auth/auth.guard';
import { InventoryService } from './inventory.service';
import { InventorySyncDto, ZodValidationPipe, inventorySyncSchema } from '../common/dto';
import { AppConfig } from '../common/config';

@ApiSecurity('middlewareApiKey')
@ApiHeader({
  name: 'x-api-key',
  required: true,
  description: 'Chave interna do middleware para autorizar o acesso às rotas',
})
@Controller()
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly configService: ConfigService<AppConfig>,
  ) { }

  @UseGuards(ApiKeyAuthGuard)
  @Post('webhooks/vtex/inventory')
  @HttpCode(200)
  async handleVtexWebhook(@Body() payload: any) {
    // Payload VTEX Broadcaster geralmente é { "IdSku": "123", "An": "...", ... }
    // Vamos aceitar genérico e processar no service
    this.inventoryService.scheduleVtexInventory(payload);
    return { status: 'accepted' };
  }

  @Post('webhooks/vtex/notify/:token')
  @HttpCode(200)
  async handleVtexNotification(
    @Param('token') token: string,
    @Body() payload: any,
  ) {
    const expectedToken = this.configService.getOrThrow<string>('VTEX_WEBHOOK_TOKEN', {
      infer: true,
    });
    if (token !== expectedToken) {
      throw new UnauthorizedException('Invalid VTEX webhook token');
    }
    this.inventoryService.scheduleVtexNotification(payload);
    return { status: 'accepted' };
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
