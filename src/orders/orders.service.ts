import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../common/config';
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
    private readonly configService: ConfigService<AppConfig>,
    private readonly logisticsService: LogisticsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrdersService.name);
  }

  async handleWebhook(payload: OrderWebhookDto) {
    const shopId = payload.shop_id;
    const orderId = payload.data.order_id;
    const eventType = payload.type;
    const statusHint =
      payload.data?.order_status ?? payload.data?.status ?? 'unknown';
    const idempotencyKey = `tiktok-order:${eventType}:${statusHint}:${orderId}`;

    this.logger.info({ shopId, orderId, eventType }, 'Processing TikTok order webhook');

    return this.idempotency.register(idempotencyKey, payload, async () => {
      try {
        const orderDetailsResponse = await this.tiktokClient.getOrder(shopId, orderId);
        const orderDetails =
          orderDetailsResponse.data?.data?.orders?.[0] ??
          orderDetailsResponse.data?.data ??
          orderDetailsResponse.data;

        this.logger.info({ orderId, status: orderDetails?.status }, 'Fetched TikTok order details');
        this.logOrderSnapshot(orderDetails, orderId);

        const recipientInfo = this.resolveRecipientAddress(orderDetails);
        const recipient = recipientInfo?.address ?? {};
        const rawPostalCode = this.extractPostalCandidates(orderDetails, recipient).find(
          (value) => value !== undefined && value !== null && String(value).trim() !== '',
        );
        const normalizedPostalCode = rawPostalCode
          ? String(rawPostalCode).replace(/\D/g, '').trim()
          : '';
        if (normalizedPostalCode.length !== 8) {
          this.logger.warn(
            {
              orderId,
              status: orderDetails?.status ?? statusHint,
              rawPostalCode,
              normalizedPostalCode,
              recipientSource: recipientInfo?.source ?? 'unknown',
            },
            'Skipping order due to missing recipient postal code',
          );
          return;
        }

        // Skip orders that are not ready for fulfillment
        // User requested to allow UNPAID orders to be sent to VTEX
        const skipStatuses = ['CANCELLED', 'CANCEL_REQUESTED'];
        if (skipStatuses.includes(orderDetails?.status)) {
          this.logger.info({ orderId, status: orderDetails?.status }, 'Skipping order - not ready for fulfillment');
          return; // Return early without processing
        }

        let vtexPayload = await this.buildVtexOrderPayload(orderDetails, shopId, {
          priceMode: 'selling',
        });

        let vtexResponse;
        try {
          vtexResponse = await this.vtexClient.createOrder(vtexPayload);
          const responseData = vtexResponse.data;
          // Fulfillment API returns an array of orders
          const firstOrder = Array.isArray(responseData) ? responseData[0] : responseData;
          const vtexOrderId = firstOrder?.orderId ?? firstOrder?.id ?? null;
          this.logger.info({ orderId, vtexOrderId }, 'Created VTEX order successfully');

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

          this.logger.info({ orderId, orderValue: orderDetails?.payment?.total }, 'Initiating label generation');

          await this.logisticsService.generateLabel(
            shopId,
            orderId,
            orderDetails?.payment?.total ?? 0,
          );

          this.logger.info({ orderId, vtexOrderId }, 'TikTok order processed successfully');
        } catch (vtexError: any) {
          if (this.isVtexPaymentMismatch(vtexError)) {
            this.logger.warn(
              {
                orderId,
                errorResponse: vtexError?.response?.data,
              },
              'VTEX rejected payment totals; retrying with full price mode',
            );
            vtexPayload = await this.buildVtexOrderPayload(orderDetails, shopId, {
              priceMode: 'price',
            });
            vtexResponse = await this.vtexClient.createOrder(vtexPayload);
            const responseData = vtexResponse.data;
            const firstOrder = Array.isArray(responseData) ? responseData[0] : responseData;
            const vtexOrderId = firstOrder?.orderId ?? firstOrder?.id ?? null;
            this.logger.info(
              { orderId, vtexOrderId },
              'Created VTEX order successfully after price fallback',
            );

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

            this.logger.info(
              { orderId, orderValue: orderDetails?.payment?.total },
              'Initiating label generation',
            );

            await this.logisticsService.generateLabel(
              shopId,
              orderId,
              orderDetails?.payment?.total ?? 0,
            );

            this.logger.info(
              { orderId, vtexOrderId },
              'TikTok order processed successfully after price fallback',
            );
            return;
          }
          this.logger.error(
            {
              err: vtexError,
              orderId,
              vtexPayload,
              errorMessage: vtexError?.message,
              errorResponse: vtexError?.response?.data,
              statusCode: vtexError?.response?.status,
            },
            'Failed to create VTEX order'
          );

          await this.prisma.orderMap.upsert({
            where: { ttsOrderId: orderId },
            update: {
              status: 'error',
              lastError: `VTEX API Error: ${vtexError?.message || 'Unknown error'}`,
              shopId,
            },
            create: {
              ttsOrderId: orderId,
              shopId,
              status: 'error',
              lastError: `VTEX API Error: ${vtexError?.message || 'Unknown error'}`,
            },
          });

          throw vtexError;
        }
      } catch (error: any) {
        this.logger.error(
          {
            err: error,
            orderId,
            shopId,
            errorResponse: error?.response?.data,
            statusCode: error?.response?.status
          },
          'Failed to process TikTok order webhook'
        );
        throw error;
      }
    });
  }

  async getLabel(orderId: string) {
    return this.logisticsService.getLabel(orderId);
  }

  private async buildVtexOrderPayload(
    order: any,
    shopId: string,
    options?: { priceMode?: 'selling' | 'price' },
  ) {
    // TikTok API v202309 uses line_items
    const items = Array.isArray(order?.line_items)
      ? order.line_items
      : Array.isArray(order?.items)
        ? order.items
        : [];
    const mappedItems: Array<{
      id: string;
      quantity: number;
      seller: string;
      price: number;
    }> = [];

    const toCents = (value: unknown): number => {
      if (value === null || value === undefined) {
        return 0;
      }
      const normalized =
        typeof value === 'string' ? value.replace(',', '.').trim() : value;
      const numeric = Number(normalized);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      return Math.round(numeric * 100);
    };

    const normalizeQuantity = (value: unknown): number => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return 1;
      }
      return Math.floor(numeric);
    };

    for (const item of items) {
      const mapping = await this.prisma.productMap.findFirst({
        where: {
          shopId,
          OR: [{ ttsSkuId: item.sku_id }, { ttsProductId: item.product_id }],
        },
      });

      if (!mapping) {
        // Fallback: try to use seller_sku as vtexSkuId if it looks like a valid ID
        if (item.seller_sku) {
          this.logger.info({ skuId: item.sku_id, sellerSku: item.seller_sku }, 'Mapping not found, trying to use seller_sku as VTEX ID');

          // Optional: Verify if SKU exists in VTEX before adding? 
          // For speed, we assume seller_sku IS the VTEX SKU ID.
          // We should also save this mapping for future use.

          try {
            await this.prisma.productMap.upsert({
              where: { vtexSkuId: item.seller_sku },
              update: {
                ttsSkuId: item.sku_id,
                ttsProductId: item.product_id,
                shopId,
              },
              create: {
                shopId,
                vtexSkuId: item.seller_sku,
                ttsSkuId: item.sku_id,
                ttsProductId: item.product_id,
                status: 'auto_mapped',
              }
            });
          } catch (e) {
            this.logger.warn({ err: e }, 'Failed to auto-create product mapping');
          }

          mappedItems.push({
            id: item.seller_sku,
            quantity: normalizeQuantity(item.quantity),
            seller: '1',
            price: toCents(item.sale_price ?? item.original_price ?? item.price ?? 0),
          });
          continue;
        }

        this.logger.warn(
          { skuId: item.sku_id, productId: item.product_id },
          'Unable to find product mapping for TikTok item; skipping',
        );
        continue;
      }

      mappedItems.push({
        id: mapping.vtexSkuId,
        quantity: normalizeQuantity(item.quantity),
        seller: '1',
        price: toCents(item.sale_price ?? item.original_price ?? item.price ?? 0),
      });
    }

    const recipientInfo = this.resolveRecipientAddress(order);
    const recipient = recipientInfo?.address ?? {};
    const rawPostalCode = this.extractPostalCandidates(order, recipient).find(
      (value) => value !== undefined && value !== null && String(value).trim() !== '',
    );
    const normalizedPostalCode = rawPostalCode
      ? String(rawPostalCode).replace(/\D/g, '').trim()
      : '';
    const postalCode =
      normalizedPostalCode.length === 8 ? normalizedPostalCode : '01001000';

    if (normalizedPostalCode.length !== 8) {
      this.logger.warn(
        {
          orderId: order?.id ?? order?.order_id,
          rawPostalCode,
          normalizedPostalCode,
          recipientSource: recipientInfo?.source ?? 'unknown',
        },
        'Invalid or missing postal code; using fallback 01001000',
      );
    }

    const rawCountry =
      recipient.region_code ??
      recipient.country ??
      recipient.country_code ??
      recipient.country_region ??
      null;
    const normalizedCountry = rawCountry
      ? String(rawCountry).trim().toUpperCase()
      : '';
    const country =
      normalizedCountry === 'BR'
        ? 'BRA'
        : normalizedCountry.length === 3
          ? normalizedCountry
          : 'BRA';

    const documentInfo = this.resolveDocument(order);

    const address = {
      addressType: 'residential',
      receiverName: recipient.name || 'TikTok Buyer',
      postalCode,
      city:
        recipient.district_info?.find((d: any) => d.address_level === 'L2')
          ?.address_name ||
        recipient.city ||
        recipient.town ||
        'São Paulo',
      state:
        recipient.district_info?.find((d: any) => d.address_level === 'L1')
          ?.address_name ||
        recipient.state ||
        recipient.province ||
        'SP',
      country,
      street:
        recipient.address_line2 ||
        recipient.address_line1 ||
        recipient.address_detail ||
        recipient.detail_address ||
        'Endereço Pendente',
      number:
        recipient.address_line3 ||
        recipient.street_number ||
        recipient.number ||
        '0',
      neighborhood:
        recipient.address_line1 ||
        recipient.district ||
        recipient.address_line2 ||
        'Centro',
      complement: recipient.address_line4 || recipient.address_extra || '',
    };

    // Simulate order to get valid SLA
    let selectedSla: string | null = null;
    let shippingEstimate = '10d';
    let shippingTotalCents = 0;
    let logisticsInfoPayload: Array<{
      itemIndex: number;
      selectedSla: string;
      price: number;
      shippingEstimate: string;
      lockTTL: string;
    }> = [];
    let simulation: any | null = null;

    try {
      this.logger.info({
        items: mappedItems.map(i => ({ id: i.id, quantity: i.quantity })),
        postalCode: address.postalCode,
        country: address.country,
        postalCodeRaw: rawPostalCode,
      }, 'Simulating order with VTEX');

      simulation = await this.vtexClient.simulateOrder(
        mappedItems,
        address.postalCode,
        address.country
      );

      this.logger.info({ simulationResult: simulation.data }, 'VTEX Simulation Result');

      const logisticsEntries = Array.isArray(simulation.data?.logisticsInfo)
        ? simulation.data.logisticsInfo
        : [];

      const defaultSlaId =
        logisticsEntries[0]?.slas?.[0]?.id ?? null;

      if (defaultSlaId) {
        selectedSla = defaultSlaId;
      }

      logisticsInfoPayload = [];
      shippingTotalCents = 0;

      logisticsEntries.forEach((entry: any, index: number) => {
        const slas = Array.isArray(entry?.slas) ? entry.slas : [];
        if (!slas.length) {
          return;
        }
        let sla =
          (selectedSla ? slas.find((s: any) => s?.id === selectedSla) : null) ??
          slas[0];

        if (!sla) {
          return;
        }

        if (!selectedSla) {
          selectedSla = sla.id;
        }

        if (sla.id !== selectedSla) {
          this.logger.warn(
            {
              orderId: order?.id ?? order?.order_id,
              itemIndex: index,
              expectedSla: selectedSla,
              resolvedSla: sla.id,
            },
            'Item did not include selected SLA; using fallback SLA',
          );
        }

        const slaPrice = Number(sla.price) || 0;
        shippingTotalCents += slaPrice;
        shippingEstimate = sla.shippingEstimate ?? shippingEstimate;
        logisticsInfoPayload.push({
          itemIndex: index,
          selectedSla: sla.id,
          price: slaPrice,
          shippingEstimate: sla.shippingEstimate ?? shippingEstimate,
          lockTTL: sla.lockTTL ?? '1bd',
        });
      });

      if (selectedSla) {
        this.logger.info(
          {
            orderId: order?.id ?? order?.order_id,
            selectedSla,
            shippingEstimate,
            shippingTotalCents,
            logisticsCount: logisticsInfoPayload.length,
          },
          'Selected SLA from simulation',
        );
      } else {
        this.logger.warn(
          { orderId: order?.id ?? order?.order_id, logisticsEntries },
          'No SLA found in simulation',
        );
      }
    } catch (e) {
      this.logger.error({ err: e, orderId: order?.id ?? order?.order_id }, 'Failed to simulate order');
    }

    if (!selectedSla) {
      const msg = `No valid SLA found for order. Check logistics configuration for SKU(s) ${mappedItems.map(i => i.id).join(',')} and Postal Code ${address.postalCode}`;
      this.logger.error(msg);
      // We throw here to stop the process and avoid FMT010
      throw new Error(msg);
    }

    const simulationItems = Array.isArray(simulation?.data?.items)
      ? simulation.data.items
      : [];
    const pricingBySkuId = this.resolveSimulationPricing(simulationItems, {
      priceMode: options?.priceMode ?? 'selling',
    });

    const pricedItems = mappedItems.map((item) => {
      const pricing = pricingBySkuId.get(String(item.id));
      const priceTags = pricing?.priceTags;
      return {
        ...item,
        price: pricing?.basePrice ?? item.price,
        ...(priceTags && priceTags.length ? { priceTags } : {}),
      };
    });

    const itemsTotalCents = pricedItems.reduce((sum, item) => {
      const pricing = pricingBySkuId.get(String(item.id));
      const unitTotal = pricing?.finalPrice ?? item.price;
      return sum + (Number(unitTotal) || 0) * item.quantity;
    }, 0);
    const paymentTotalCents = itemsTotalCents + shippingTotalCents;

    if (paymentTotalCents <= 0) {
      this.logger.warn(
        {
          orderId: order?.id ?? order?.order_id,
          itemsTotalCents,
          shippingTotalCents,
        },
        'Computed payment total is zero or invalid; check pricing and simulation data',
      );
    }

    const logisticsInfo =
      logisticsInfoPayload.length > 0
        ? logisticsInfoPayload
        : pricedItems.map((_, index) => ({
            itemIndex: index,
            selectedSla: selectedSla ?? 'STANDARD',
            price: index === 0 ? shippingTotalCents : 0,
            shippingEstimate,
            lockTTL: '1bd',
          }));

    const marketplaceServicesEndpoint =
      this.configService.get<string>('VTEX_MARKETPLACE_SERVICES_ENDPOINT', { infer: true }) ??
      this.configService.get<string>('PUBLIC_BASE_URL', { infer: true }) ??
      'TikTokShop';
    const paymentSystemId =
      this.configService.get<string>('VTEX_PAYMENT_SYSTEM_ID', { infer: true }) ?? '201';
    const paymentSystemName = this.configService.get<string>('VTEX_PAYMENT_SYSTEM_NAME', {
      infer: true,
    });
    const paymentGroup = this.configService.get<string>('VTEX_PAYMENT_GROUP', { infer: true });
    const paymentMerchant = this.configService.get<string>('VTEX_PAYMENT_MERCHANT', {
      infer: true,
    });
    const payment: Record<string, unknown> = {
      paymentSystem: paymentSystemId,
      installments: 1,
      value: paymentTotalCents,
      referenceValue: paymentTotalCents,
    };

    if (paymentSystemName) {
      payment.paymentSystemName = paymentSystemName;
    }
    if (paymentGroup) {
      payment.group = paymentGroup;
    }
    if (paymentMerchant) {
      payment.merchantName = paymentMerchant;
    }

    // Fulfillment API expects an array of orders
    return [
      {
        marketplaceOrderId: order?.id ?? order?.order_id,
        marketplaceServicesEndpoint,
        marketplacePaymentValue: paymentTotalCents,
        items: pricedItems,
        clientProfileData: {
          ...this.resolveBuyerProfile(order, recipient),
          documentType: documentInfo.type,
          document: documentInfo.value,
        },
        shippingData: {
          address,
          selectedSla,
          logisticsInfo,
        },
        paymentData: {
          payments: [payment],
        },
      }
    ];
  }

  private resolveSimulationPricing(
    simulationItems: any[],
    options: { priceMode: 'selling' | 'price' },
  ): Map<string, { basePrice: number; finalPrice: number; priceTags?: any[] }> {
    const pricingBySkuId = new Map<string, { basePrice: number; finalPrice: number; priceTags?: any[] }>();
    for (const item of simulationItems) {
      const id = item?.id ?? item?.itemId ?? item?.skuId;
      if (!id) continue;

      const basePrice = Number(item?.price ?? item?.listPrice);
      const sellingPrice = Number(
        item?.sellingPrice ??
          item?.priceDefinition?.calculatedSellingPrice ??
          item?.priceDefinition?.total,
      );
      const rawTags = Array.isArray(item?.priceTags) ? item.priceTags : [];
      const priceTags = options.priceMode === 'selling' ? this.sanitizePriceTags(rawTags) : [];
      const tagTotal = priceTags.reduce((sum, tag) => sum + (Number(tag.value) || 0), 0);

      let finalPrice = basePrice;
      if (options.priceMode === 'selling') {
        if (Number.isFinite(basePrice) && priceTags.length) {
          finalPrice = basePrice + tagTotal;
        } else if (Number.isFinite(sellingPrice) && sellingPrice > 0) {
          finalPrice = sellingPrice;
        }
      } else if (Number.isFinite(basePrice) && basePrice > 0) {
        finalPrice = basePrice;
      } else if (Number.isFinite(sellingPrice) && sellingPrice > 0) {
        finalPrice = sellingPrice;
      }

      if (Number.isFinite(basePrice) && basePrice > 0) {
        pricingBySkuId.set(String(id), {
          basePrice,
          finalPrice: Number.isFinite(finalPrice) ? finalPrice : basePrice,
          ...(priceTags.length ? { priceTags } : {}),
        });
      }
    }
    return pricingBySkuId;
  }

  private sanitizePriceTags(tags: any[]): Array<{
    name: string;
    value: number;
    isPercentual?: boolean;
    identifier?: string | null;
    rawValue?: number;
  }> {
    return tags
      .map((tag) => ({
        name: String(tag?.name ?? ''),
        value: Number(tag?.value ?? 0),
        isPercentual: typeof tag?.isPercentual === 'boolean' ? tag.isPercentual : undefined,
        identifier: tag?.identifier ?? undefined,
        rawValue:
          tag?.rawValue !== undefined && tag?.rawValue !== null
            ? Number(tag.rawValue)
            : undefined,
      }))
      .filter((tag) => tag.name && Number.isFinite(tag.value));
  }

  private isVtexPaymentMismatch(error: any): boolean {
    const code = error?.response?.data?.error?.code;
    return code === 'FMT007';
  }

  private logOrderSnapshot(order: any, orderId: string) {
    if (!order || typeof order !== 'object') {
      return;
    }

    const status = order?.status ?? order?.order_status ?? 'unknown';
    const recipientInfo = this.resolveRecipientAddress(order);
    const recipient = recipientInfo?.address ?? null;
    const recipientKeys =
      recipient && typeof recipient === 'object' ? Object.keys(recipient) : [];
    const postalCandidates = this.extractPostalCandidates(order, recipient ?? {});
    const postalHints = postalCandidates
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
      .map((value) => {
        const normalized = String(value).replace(/\D/g, '');
        return {
          length: normalized.length,
          suffix: normalized.slice(-3),
        };
      });

    const docCandidates = this.extractDocumentCandidates(order);
    const docHints = docCandidates
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
      .map((value) => {
        const normalized = String(value).replace(/\D/g, '');
        return {
          length: normalized.length,
          suffix: normalized.slice(-3),
        };
      });

    this.logger.info(
      {
        orderId,
        status,
        recipientSource: recipientInfo?.source ?? 'unknown',
        recipientKeys,
        postalHints,
        docHints,
        hasLineItems:
          Array.isArray(order?.line_items) || Array.isArray(order?.items),
      },
      'TikTok order snapshot',
    );
  }

  private resolveRecipientAddress(order: any): { address: any; source: string } | null {
    const candidates = [
      { source: 'recipient_address', value: order?.recipient_address },
      {
        source: 'recipient_address_list',
        value: Array.isArray(order?.recipient_address_list)
          ? order.recipient_address_list[0]
          : undefined,
      },
      { source: 'shipping_address', value: order?.shipping_address },
      {
        source: 'shipping_address_list',
        value: Array.isArray(order?.shipping_address_list)
          ? order.shipping_address_list[0]
          : undefined,
      },
      { source: 'buyer_address', value: order?.buyer_address },
      { source: 'address', value: order?.address },
      { source: 'recipient', value: order?.recipient?.address ?? order?.recipient },
      { source: 'shipping', value: order?.shipping?.address ?? order?.shipping },
    ];

    for (const candidate of candidates) {
      if (!candidate.value || typeof candidate.value !== 'object') {
        continue;
      }
      if (this.isAddressLike(candidate.value)) {
        return { address: candidate.value, source: candidate.source };
      }
    }

    return null;
  }

  private isAddressLike(value: any): boolean {
    return Boolean(
      value?.postal_code ||
        value?.zip_code ||
        value?.postcode ||
        value?.address_line1 ||
        value?.address_line2 ||
        value?.city ||
        value?.state,
    );
  }

  private extractPostalCandidates(order: any, recipient: any): Array<unknown> {
    return [
      recipient?.postal_code,
      recipient?.zip_code,
      recipient?.zipcode,
      recipient?.postcode,
      recipient?.post_code,
      recipient?.zip,
      order?.postal_code,
      order?.zip_code,
      order?.postcode,
      order?.buyer_address?.postal_code,
      order?.shipping_address?.postal_code,
    ];
  }

  private resolveDocument(order: any): { type: 'cpf' | 'cnpj'; value: string } {
    const candidates = this.extractDocumentCandidates(order);

    const raw = candidates.find((value) => value !== undefined && value !== null);
    const normalized = raw ? String(raw).replace(/\D/g, '').trim() : '';

    if (normalized.length === 11 && this.isValidCpf(normalized)) {
      return { type: 'cpf', value: normalized };
    }

    if (normalized.length === 14 && this.isValidCnpj(normalized)) {
      return { type: 'cnpj', value: normalized };
    }

    const seed = `${order?.buyer_email ?? ''}:${order?.id ?? order?.order_id ?? ''}`;
    const generated = this.generateCpfFromSeed(seed);
    this.logger.warn(
      {
        orderId: order?.id ?? order?.order_id,
        documentSource: raw ? 'order' : 'missing',
        documentLength: normalized.length || 0,
      },
      'Invalid or missing document; using generated CPF',
    );
    return { type: 'cpf', value: generated };
  }

  private extractDocumentCandidates(order: any): Array<unknown> {
    return [
      order?.cpf,
      order?.buyer_cpf,
      order?.buyer_tax_number,
      order?.buyer_tax_id,
      order?.buyer_document,
      order?.buyer_id_number,
      order?.buyer_identity_number,
      order?.buyer?.tax_id,
      order?.buyer?.taxId,
      order?.buyer?.tax_number,
      order?.buyer?.taxNumber,
      order?.buyer?.document,
      order?.buyer?.document_number,
      order?.buyer?.cpf,
      order?.buyer?.cnpj,
      order?.buyer_info?.tax_id,
      order?.buyer_info?.taxId,
      order?.buyer_info?.tax_number,
      order?.buyer_info?.document,
      order?.recipient_address?.tax_id,
      order?.recipient_address?.taxId,
      order?.recipient_address?.tax_number,
      order?.recipient_address?.taxNumber,
      order?.recipient_address?.document,
      order?.recipient_address?.document_number,
      order?.recipient_address?.cpf,
      order?.recipient_address?.cnpj,
      order?.recipient_address?.id_number,
      order?.recipient_address?.identity_number,
      order?.recipient_address?.id_card_number,
      order?.recipient_address_list?.[0]?.tax_id,
      order?.recipient_address_list?.[0]?.tax_number,
      order?.recipient_address_list?.[0]?.document,
      order?.shipping_address?.tax_id,
      order?.shipping_address?.tax_number,
      order?.shipping_address?.document,
    ];
  }

  private resolveBuyerProfile(order: any, recipient: any) {
    const email =
      typeof order?.buyer_email === 'string' && order.buyer_email.includes('@')
        ? order.buyer_email
        : 'no-reply@tiktokshop.com';

    const nameCandidate =
      order?.cpf_name ||
      recipient?.name ||
      [recipient?.first_name, recipient?.last_name].filter(Boolean).join(' ') ||
      email.split('@')[0] ||
      'TikTok Buyer';

    const { firstName, lastName } = this.splitName(nameCandidate);

    return {
      firstName,
      lastName,
      email,
      phone: this.resolveBuyerPhone(order, recipient),
    };
  }

  private resolveBuyerPhone(order: any, recipient: any): string {
    const candidates = [
      recipient?.phone_number,
      recipient?.phone,
      recipient?.mobile_phone,
      order?.buyer_phone,
      order?.buyer_phone_number,
      order?.buyer_mobile,
      order?.buyer_mobile_phone,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const digits = String(candidate).replace(/\D/g, '');
      if (digits.length >= 10) {
        return digits;
      }
    }
    return '11999999999';
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const trimmed = name?.toString().trim();
    if (!trimmed) {
      return { firstName: 'TikTok', lastName: 'Buyer' };
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: 'Buyer' };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  private generateCpfFromSeed(seed: string): string {
    const digits = this.digitsFromSeed(seed, 9);
    const firstDigit = this.computeCpfDigit(digits, 10);
    const secondDigit = this.computeCpfDigit([...digits, firstDigit], 11);
    return [...digits, firstDigit, secondDigit].join('');
  }

  private digitsFromSeed(seed: string, count: number): number[] {
    const hash = createHash('sha256').update(seed || 'fallback').digest('hex');
    const digits: number[] = [];
    for (const ch of hash) {
      digits.push(parseInt(ch, 16) % 10);
      if (digits.length >= count) {
        break;
      }
    }
    if (digits.length < count) {
      while (digits.length < count) {
        digits.push(0);
      }
    }
    if (digits.every((value) => value === digits[0])) {
      digits[0] = (digits[0] + 1) % 10;
    }
    return digits;
  }

  private computeCpfDigit(digits: number[], factor: number): number {
    let sum = 0;
    for (const digit of digits) {
      sum += digit * factor;
      factor -= 1;
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  }

  private isValidCpf(value: string): boolean {
    if (value.length !== 11) {
      return false;
    }
    if (/^(\d)\1{10}$/.test(value)) {
      return false;
    }
    const digits = value.split('').map((d) => Number(d));
    const firstDigit = this.computeCpfDigit(digits.slice(0, 9), 10);
    const secondDigit = this.computeCpfDigit(digits.slice(0, 10), 11);
    return digits[9] === firstDigit && digits[10] === secondDigit;
  }

  private isValidCnpj(value: string): boolean {
    if (value.length !== 14) {
      return false;
    }
    if (/^(\d)\1{13}$/.test(value)) {
      return false;
    }
    const digits = value.split('').map((d) => Number(d));
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const calcDigit = (base: number[], weights: number[]) => {
      const sum = base.reduce((acc, digit, index) => acc + digit * weights[index], 0);
      const mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    };

    const firstDigit = calcDigit(digits.slice(0, 12), weights1);
    const secondDigit = calcDigit(digits.slice(0, 13), weights2);
    return digits[12] === firstDigit && digits[13] === secondDigit;
  }
}
