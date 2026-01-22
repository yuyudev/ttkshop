import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { TiktokLogisticsClient } from './tiktok-logistics.client';
import { VtexOrdersClient } from '../orders/vtex-orders.client';

@Injectable()
export class LogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsClient: TiktokLogisticsClient,
    private readonly vtexOrdersClient: VtexOrdersClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogisticsService.name);
  }

  async generateLabel(shopId: string, orderId: string, orderValue?: number) {
    this.logger.info({ shopId, orderId, orderValue }, 'Generating shipping label');

    const mapping = await this.prisma.orderMap.findUnique({
      where: {
        shopId_ttsOrderId: {
          shopId,
          ttsOrderId: orderId,
        },
      },
    });

    if (!mapping) {
      this.logger.error({ orderId }, 'Order mapping not found for label generation');
      throw new NotFoundException(`Order mapping not found for TikTok order ${orderId}`);
    }

    const response = await this.logisticsClient.getOrCreateShippingDocument(shopId, orderId);
    const labelUrl =
      response.data?.data?.label_url ??
      response.data?.data?.document_url ??
      response.data?.label_url ??
      null;

    this.logger.info({ orderId, labelUrl }, 'Shipping label generated');

    await this.prisma.orderMap.update({
      where: {
        shopId_ttsOrderId: {
          shopId,
          ttsOrderId: orderId,
        },
      },
      data: {
        labelUrl,
        lastError: null,
        shopId,
      },
    });

    if (mapping.vtexOrderId && labelUrl) {
      try {
        const docDetails = await this.logisticsClient.getShippingDocument(shopId, orderId);
        const trackingNumber =
          docDetails.data?.data?.tracking_number ?? docDetails.data?.tracking_number;
        const provider =
          docDetails.data?.data?.shipping_provider ??
          docDetails.data?.shipping_provider ??
          'TikTok Shipping';

        if (trackingNumber) {
          this.logger.info({ orderId, vtexOrderId: mapping.vtexOrderId, trackingNumber, provider }, 'Updating VTEX with tracking info');
          await this.updateVtexTracking(
            shopId,
            mapping.vtexOrderId,
            trackingNumber,
            provider,
            orderValue ?? 0,
          );
          this.logger.info({ orderId, vtexOrderId: mapping.vtexOrderId }, 'Updated VTEX tracking');
        } else {
          this.logger.warn({ orderId }, 'No tracking number available from TikTok');
        }
      } catch (err) {
        this.logger.error({ err, orderId }, 'Failed to update VTEX tracking');
      }
    }

    return {
      orderId,
      labelUrl,
      document: response.data?.data ?? response.data,
    };
  }

  private async updateVtexTracking(
    shopId: string,
    vtexOrderId: string,
    trackingNumber: string,
    courier: string,
    value: number,
  ) {
    const invoiceData = {
      type: 'Output',
      invoiceNumber: `TTS-${trackingNumber.slice(-5)}`,
      issuanceDate: new Date().toISOString().split('T')[0],
      invoiceValue: value,
      trackingNumber,
      courier,
      items: [], // VTEX allows empty items for simple invoice
    };
    return this.vtexOrdersClient.updateTracking(shopId, vtexOrderId, invoiceData);
  }

  async getLabel(shopId: string, orderId: string) {
    const mapping = await this.prisma.orderMap.findUnique({
      where: {
        shopId_ttsOrderId: {
          shopId,
          ttsOrderId: orderId,
        },
      },
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
