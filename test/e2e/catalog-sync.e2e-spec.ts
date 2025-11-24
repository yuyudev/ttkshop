import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaService } from '../utils/mock-prisma.service';
import { VtexCatalogClient } from '../../src/catalog/vtex-catalog.client';
import { TiktokProductClient } from '../../src/catalog/tiktok-product.client';
import { CatalogService } from '../../src/catalog/catalog.service';
import { ensureTestEnv } from '../utils/test-env';

describe('Catalog Sync (e2e)', () => {
  let app: INestApplication;
  let catalogService: CatalogService;
  const prisma = new MockPrismaService();

  const vtexClientMock = {
    listSkus: jest.fn().mockResolvedValue([{ id: 'sku-10', productId: 'prod-10' }]),
    getSkuById: jest.fn().mockResolvedValue({
      id: 'sku-10',
      name: 'Produto Teste',
      productId: 'prod-10',
      stockBalance: 5,
      EAN: '1234567890123',
    }),
    getPrice: jest.fn().mockResolvedValue(2999),
    getSkuImages: jest
      .fn()
      .mockResolvedValue([
        { url: 'https://vtex/image.jpg', isMain: true, position: 0 },
      ]),
    getProductById: jest.fn().mockResolvedValue({
      Id: 10,
      Name: 'Produto Teste',
      Description: 'Descrição',
      BrandName: 'Marca Teste',
    }),
    getProductWithSkus: jest.fn().mockResolvedValue({
      productId: 'prod-10',
      skus: [{ id: 'sku-10' }],
    }),
    getSkuInventory: jest.fn().mockResolvedValue(5),
  };

  const tiktokProductClientMock = {
    createProduct: jest.fn().mockResolvedValue({
      productId: 'tik-10',
      skuIds: { 'sku-10': 'tik-sku-10' },
      raw: { data: { product_id: 'tik-10', skus: [{ id: 'tik-sku-10' }] } },
    }),
    updateProduct: jest.fn(),
    updateStock: jest.fn(),
  };

  beforeAll(async () => {
    ensureTestEnv();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(VtexCatalogClient)
      .useValue(vtexClientMock)
      .overrideProvider(TiktokProductClient)
      .useValue(tiktokProductClientMock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    catalogService = app.get(CatalogService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('syncs catalog entries to TikTok', async () => {
    const result = await catalogService.syncCatalog('shop123', {});
    expect(result.synced).toBe(1);

    const mapping = prisma.productMap.get('sku-10');
    expect(mapping?.ttsSkuId).toBe('tik-sku-10');
    expect(tiktokProductClientMock.createProduct).toHaveBeenCalled();
  });
});
