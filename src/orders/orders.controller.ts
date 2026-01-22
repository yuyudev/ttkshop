import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiKeyAuthGuard } from '../auth/auth.guard';
import { ShopConfigService } from '../common/shop-config.service';
import {
  OrderWebhookDto,
  TiktokWebhookDto,
  ZodValidationPipe,
  orderWebhookSchema,
  tiktokWebhookSchema,
} from '../common/dto';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly shopConfigService: ShopConfigService,
  ) {}

  @Post('webhooks/tiktok/orders')
  @HttpCode(200)
  async handleWebhook(
    @Body(new ZodValidationPipe<TiktokWebhookDto>(tiktokWebhookSchema))
    payload: TiktokWebhookDto,
  ) {
    const data = payload?.data as Record<string, unknown> | undefined;
    if (!data || !data.order_id) {
      return { status: 'ignored' };
    }

    const parser = new ZodValidationPipe<OrderWebhookDto>(orderWebhookSchema);
    let orderPayload: OrderWebhookDto;
    try {
      orderPayload = parser.transform(payload);
    } catch (error: any) {
      throw new BadRequestException(error?.response ?? 'Invalid TikTok order webhook payload');
    }

    const status = await this.ordersService.handleWebhook(orderPayload);
    return { status };
  }

  @UseGuards(ApiKeyAuthGuard)
  @Get('orders/:ttsOrderId/label')
  async getLabel(@Param('ttsOrderId') orderId: string) {
    return this.ordersService.getLabel(orderId);
  }

  @Post('webhooks/vtex/marketplace/:token')
  @HttpCode(200)
  async handleVtexMarketplace(
    @Param('token') token: string,
    @Body() payload: any,
  ) {
    const shopId = await this.shopConfigService.resolveShopIdByVtexWebhookToken(token);
    this.ordersService.scheduleVtexMarketplaceNotification(payload, shopId);
    return { status: 'accepted' };
  }
}
