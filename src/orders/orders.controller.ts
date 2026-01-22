import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiKeyAuthGuard } from '../auth/auth.guard';
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
  constructor(private readonly ordersService: OrdersService) {}

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
  async getLabel(
    @Headers('x-tts-shopid') shopId: string,
    @Param('ttsOrderId') orderId: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('Missing x-tts-shopid header');
    }
    return this.ordersService.getLabel(shopId, orderId);
  }
}
