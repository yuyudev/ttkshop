import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaService } from '../utils/mock-prisma.service';
import { TiktokOrderClient } from '../../src/orders/tiktok-order.client';
import { VtexOrdersClient } from '../../src/orders/vtex-orders.client';
import { LogisticsService } from '../../src/logistics/logistics.service';
import { OrdersService } from '../../src/orders/orders.service';
import { ensureTestEnv } from '../utils/test-env';

describe('TikTok Orders Webhook (e2e)', () => {
  let app: INestApplication;
  const prisma = new MockPrismaService();
  let ordersService: OrdersService;

  const tiktokOrderClientMock = {
    getOrder: jest.fn().mockResolvedValue({
      data: {
        data: {
          order_id: 'order-001',
          items: [
            { sku_id: 'sku-001', product_id: 'prod-001', quantity: 1, price: 1000 },
          ],
          buyer: { first_name: 'Alice', last_name: 'Doe', email: 'alice@example.com' },
          shipping_address: { street: 'Rua A', city: 'São Paulo', postal_code: '01001000' },
          payment: { total: 1000 },
        },
      },
    }),
  };

  const vtexOrdersClientMock = {
    createOrder: jest.fn().mockResolvedValue({ data: { orderId: 'vtex-001' } }),
    simulateOrder: jest.fn().mockResolvedValue({
      data: {
        logisticsInfo: [
          {
            slas: [
              {
                id: 'STANDARD',
                price: 0,
                shippingEstimate: '10d',
                lockTTL: '1bd',
              },
            ],
          },
        ],
        items: [
          {
            id: 'sku-001',
            price: 1000,
            sellingPrice: 1000,
            priceTags: [],
          },
        ],
      },
    }),
  };

  const logisticsServiceMock = {
    generateLabel: jest.fn().mockResolvedValue({ labelUrl: 'https://label' }),
    getLabel: jest.fn(),
  };

  beforeAll(async () => {
    ensureTestEnv();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(TiktokOrderClient)
      .useValue(tiktokOrderClientMock)
      .overrideProvider(VtexOrdersClient)
      .useValue(vtexOrdersClientMock)
      .overrideProvider(LogisticsService)
      .useValue(logisticsServiceMock)
      .compile();

    await prisma.tiktokAuth.upsert({
      where: { shopId: 'shop123' },
      create: {
        shopId: 'shop123',
        tiktokShopCipher: 'cipher-123',
        tiktokWarehouseId: 'warehouse-1',
        tiktokDefaultCategoryId: '600001',
        vtexAccount: 'account',
        vtexEnvironment: 'vtexcommercestable',
        vtexAppKey: 'key',
        vtexAppToken: 'token',
        vtexWarehouseId: '1_1',
        vtexSalesChannel: '1',
      },
      update: {
        tiktokShopCipher: 'cipher-123',
        tiktokWarehouseId: 'warehouse-1',
        tiktokDefaultCategoryId: '600001',
        vtexAccount: 'account',
        vtexEnvironment: 'vtexcommercestable',
        vtexAppKey: 'key',
        vtexAppToken: 'token',
        vtexWarehouseId: '1_1',
        vtexSalesChannel: '1',
      },
    });

    await prisma.productMap.upsert({
      where: { vtexSkuId: 'sku-001' },
      create: {
        vtexSkuId: 'sku-001',
        shopId: 'shop123',
        ttsSkuId: 'sku-001',
        status: 'synced',
      },
      update: {
        vtexSkuId: 'sku-001',
        shopId: 'shop123',
        ttsSkuId: 'sku-001',
        status: 'synced',
      },
    });

    app = moduleRef.createNestApplication();
    await app.init();
    ordersService = app.get(OrdersService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes orders idempotently', async () => {
    const payload = {
      type: 1,
      shop_id: 'shop123',
      data: {
        order_id: 'order-001',
        order_status: 'AWAITING_SHIPMENT',
      },
    };

    const first = await ordersService.handleWebhook(payload);
    expect(first).toBe('processed');

    const mapping = prisma.orderMap.get('order-001');
    expect(mapping?.vtexOrderId).toBe('vtex-001');
    expect(logisticsServiceMock.generateLabel).toHaveBeenCalledTimes(1);

    const second = await ordersService.handleWebhook(payload);
    expect(second).toBe('skipped');

    expect(logisticsServiceMock.generateLabel).toHaveBeenCalledTimes(1);
  });
});
