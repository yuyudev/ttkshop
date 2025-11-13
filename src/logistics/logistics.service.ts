import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { TiktokLogisticsClient } from './tiktok-logistics.client';

@Injectable()
export class LogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsClient: TiktokLogisticsClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogisticsService.name);
  }

  async generateLabel(shopId: string, orderId: string) {
    const mapping = await this.prisma.orderMap.findUnique({
      where: { ttsOrderId: orderId },
    });

    if (!mapping) {
      throw new NotFoundException(`Order mapping not found for TikTok order ${orderId}`);
    }

    const response = await this.logisticsClient.getOrCreateShippingDocument(shopId, orderId);
    const labelUrl =
      response.data?.data?.label_url ??
      response.data?.data?.document_url ??
      response.data?.label_url ??
      null;

    await this.prisma.orderMap.update({
      where: { ttsOrderId: orderId },
      data: {
        labelUrl,
        lastError: null,
        shopId,
      },
    });

    return {
      orderId,
      labelUrl,
      document: response.data?.data ?? response.data,
    };
  }

  async getLabel(orderId: string) {
    const mapping = await this.prisma.orderMap.findUnique({
      where: { ttsOrderId: orderId },
    });

    if (!mapping) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (mapping.labelUrl) {
      return { orderId, labelUrl: mapping.labelUrl };
    }

    this.logger.warn({ orderId }, 'Label not cached, fetching directly from TikTok');

    const response = await this.logisticsClient.getShippingDocument(mapping.shopId, orderId);

    return {
      orderId,
      document: response.data?.data ?? response.data,
    };
  }
}
