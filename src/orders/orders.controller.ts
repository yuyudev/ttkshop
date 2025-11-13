import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiKeyAuthGuard } from '../auth/auth.guard';
import { OrderWebhookDto, ZodValidationPipe, orderWebhookSchema } from '../common/dto';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('webhooks/tiktok/orders')
  async handleWebhook(
    @Body(new ZodValidationPipe<OrderWebhookDto>(orderWebhookSchema))
    payload: OrderWebhookDto,
  ) {
    const status = await this.ordersService.handleWebhook(payload);
    return { status };
  }

  @UseGuards(ApiKeyAuthGuard)
  @Get('orders/:ttsOrderId/label')
  async getLabel(@Param('ttsOrderId') orderId: string) {
    return this.ordersService.getLabel(orderId);
  }
}
