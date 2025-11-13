import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { OrderWebhookDto } from '../common/dto';
import { IdempotencyService } from '../common/idempotency.service';
import { PrismaService } from '../prisma/prisma.service';
import { TiktokOrderClient } from './tiktok-order.client';
import { VtexOrdersClient } from './vtex-orders.client';
import { LogisticsService } from '../logistics/logistics.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly tiktokClient: TiktokOrderClient,
    private readonly vtexClient: VtexOrdersClient,
    private readonly idempotency: IdempotencyService,
    private readonly prisma: PrismaService,
    private readonly logisticsService: LogisticsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrdersService.name);
  }

  async handleWebhook(payload: OrderWebhookDto) {
    const shopId = payload.shop_id;
    const orderId = payload.order_id;
    const idempotencyKey = `tiktok-order:${payload.event_type}:${orderId}`;

    return this.idempotency.register(idempotencyKey, payload, async () => {
      const orderDetailsResponse = await this.tiktokClient.getOrder(shopId, orderId);
      const orderDetails = orderDetailsResponse.data?.data ?? orderDetailsResponse.data;

      const vtexPayload = await this.buildVtexOrderPayload(orderDetails, shopId);
      const vtexResponse = await this.vtexClient.createOrder(vtexPayload);
      const vtexOrderId = vtexResponse.data?.orderId ?? vtexResponse.data?.id ?? null;

      await this.prisma.orderMap.upsert({
        where: { ttsOrderId: orderId },
        update: {
          vtexOrderId,
          status: 'imported',
          lastError: null,
          shopId,
        },
        create: {
          ttsOrderId: orderId,
          shopId,
          vtexOrderId,
          status: 'imported',
        },
      });

      await this.logisticsService.generateLabel(shopId, orderId);
    });
  }

  async getLabel(orderId: string) {
    return this.logisticsService.getLabel(orderId);
  }

  private async buildVtexOrderPayload(order: any, shopId: string) {
    const items = Array.isArray(order?.items) ? order.items : [];
    const mappedItems = [];

    for (const item of items) {
      const mapping = await this.prisma.productMap.findFirst({
        where: {
          shopId,
          OR: [{ ttsSkuId: item.sku_id }, { ttsProductId: item.product_id }],
        },
      });

      if (!mapping) {
        this.logger.warn(
          { skuId: item.sku_id },
          'Unable to find product mapping for TikTok item; skipping',
        );
        continue;
      }

      mappedItems.push({
        id: mapping.vtexSkuId,
        quantity: item.quantity ?? 1,
        seller: '1',
        price: item.price ?? 0,
      });
    }

    return {
      marketplaceOrderId: order?.order_id,
      clientProfileData: {
        firstName: order?.buyer?.first_name ?? 'TikTok',
        lastName: order?.buyer?.last_name ?? 'Buyer',
        email: order?.buyer?.email ?? 'no-reply@tiktokshop.com',
      },
      shippingData: {
        address: order?.shipping_address ?? {},
      },
      items: mappedItems,
      marketplaceServicesEndpoint: 'TikTokShop',
      paymentData: {
        payments: [
          {
            paymentSystem: '2',
            value: order?.payment?.total ?? 0,
          },
        ],
      },
    };
  }
}
