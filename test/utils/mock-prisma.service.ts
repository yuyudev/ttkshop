import { randomUUID } from 'crypto';

interface TiktokAuthRecord {
  id: string;
  shopId: string;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  scopes?: string | null;
  tiktokShopCipher?: string | null;
  tiktokWarehouseId?: string | null;
  tiktokDefaultCategoryId?: string | null;
  tiktokBrandId?: string | null;
  tiktokBrandName?: string | null;
  vtexWebhookToken?: string | null;
  vtexAffiliateId?: string | null;
  vtexSalesChannel?: string | null;
  vtexAccount?: string | null;
  vtexEnvironment?: string | null;
  vtexAppKey?: string | null;
  vtexAppToken?: string | null;
  vtexWarehouseId?: string | null;
  vtexDomain?: string | null;
  vtexPricingDomain?: string | null;
  vtexMarketplaceServicesEndpoint?: string | null;
  vtexPaymentSystemId?: string | null;
  vtexPaymentSystemName?: string | null;
  vtexPaymentGroup?: string | null;
  vtexPaymentMerchant?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductMapRecord {
  id: string;
  vtexSkuId: string;
  shopId: string;
  ttsProductId?: string | null;
  ttsSkuId?: string | null;
  status: string;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OrderMapRecord {
  id: string;
  shopId: string;
  ttsOrderId: string;
  vtexOrderId?: string | null;
  status: string;
  lastError?: string | null;
  labelUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface IdempotencyRecord {
  id: string;
  key: string;
  processedAt: Date;
  payloadHash: string;
}

export class MockPrismaService {
  public readonly tiktokAuth = new TiktokAuthDelegate();
  public readonly productMap = new ProductMapDelegate();
  public readonly orderMap = new OrderMapDelegate();
  public readonly idempotency = new IdempotencyDelegate();

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async $connect(): Promise<void> {
    return;
  }
}

class TiktokAuthDelegate {
  private readonly store = new Map<string, TiktokAuthRecord>();

  async findUnique(args: { where: { shopId: string } }): Promise<TiktokAuthRecord | null> {
    return this.store.get(args.where.shopId) ?? null;
  }

  async findMany(args?: { select?: { shopId?: boolean } }): Promise<Array<{ shopId: string }>> {
    if (args?.select?.shopId) {
      return Array.from(this.store.values()).map((item) => ({ shopId: item.shopId }));
    }
    return Array.from(this.store.values()) as any;
  }

  async findFirst(args: { where: any; select?: any }): Promise<TiktokAuthRecord | null> {
    const entries = Array.from(this.store.values());
    return entries.find((entry) => matchesWhere(entry, args.where)) ?? null;
  }

  async upsert(args: {
    where: { shopId: string };
    create: Partial<TiktokAuthRecord>;
    update: Partial<TiktokAuthRecord>;
  }): Promise<TiktokAuthRecord> {
    const existing = this.store.get(args.where.shopId);
    const record: TiktokAuthRecord = existing
      ? {
          ...existing,
          ...args.update,
          updatedAt: new Date(),
        }
      : {
          id: randomUUID(),
          shopId: args.where.shopId,
          accessToken: '',
          accessExpiresAt: new Date(),
          refreshToken: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.create,
        };
    this.store.set(args.where.shopId, record);
    return record;
  }

  async update(args: { where: { shopId: string }; data: Partial<TiktokAuthRecord> }) {
    const existing = await this.findUnique(args);
    if (!existing) {
      throw new Error('Record not found');
    }
    const updated: TiktokAuthRecord = {
      ...existing,
      ...args.data,
      updatedAt: new Date(),
    };
    this.store.set(args.where.shopId, updated);
    return updated;
  }
}

class ProductMapDelegate {
  private readonly store = new Map<string, ProductMapRecord>();

  get(vtexSkuId: string): ProductMapRecord | undefined {
    return this.store.get(vtexSkuId);
  }

  async findUnique(args: { where: { vtexSkuId: string } }): Promise<ProductMapRecord | null> {
    return this.store.get(args.where.vtexSkuId) ?? null;
  }

  async upsert(args: {
    where: { vtexSkuId: string };
    create: Partial<ProductMapRecord>;
    update: Partial<ProductMapRecord>;
  }): Promise<ProductMapRecord> {
    const existing = this.store.get(args.where.vtexSkuId);
    const now = new Date();
    const record: ProductMapRecord = existing
      ? {
          ...existing,
          ...args.update,
          updatedAt: now,
        }
      : {
          id: randomUUID(),
          vtexSkuId: args.where.vtexSkuId,
          shopId: '',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          ...args.create,
        };
    this.store.set(args.where.vtexSkuId, record);
    return record;
  }

  async update(args: { where: { vtexSkuId: string }; data: Partial<ProductMapRecord> }) {
    const existing = await this.findUnique(args);
    if (!existing) {
      throw new Error('Product mapping not found');
    }
    const updated: ProductMapRecord = {
      ...existing,
      ...args.data,
      updatedAt: new Date(),
    };
    this.store.set(args.where.vtexSkuId, updated);
    return updated;
  }

  async findMany(args: { where: Partial<ProductMapRecord> }): Promise<ProductMapRecord[]> {
    const entries = Array.from(this.store.values());
    return entries.filter((entry) => matchesWhere(entry, args.where));
  }

  async findFirst(args: { where: any }): Promise<ProductMapRecord | null> {
    const entries = await this.findMany({ where: args.where });
    return entries[0] ?? null;
  }
}

class OrderMapDelegate {
  private readonly store = new Map<string, OrderMapRecord>();

  get(ttsOrderId: string): OrderMapRecord | undefined {
    return this.store.get(ttsOrderId);
  }

  async findUnique(args: { where: { ttsOrderId: string } }): Promise<OrderMapRecord | null> {
    return this.store.get(args.where.ttsOrderId) ?? null;
  }

  async upsert(args: {
    where: { ttsOrderId: string };
    create: Partial<OrderMapRecord>;
    update: Partial<OrderMapRecord>;
  }): Promise<OrderMapRecord> {
    const existing = this.store.get(args.where.ttsOrderId);
    const now = new Date();
    const record: OrderMapRecord = existing
      ? {
          ...existing,
          ...args.update,
          updatedAt: now,
        }
      : {
          id: randomUUID(),
          shopId: '',
          ttsOrderId: args.where.ttsOrderId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          ...args.create,
        };
    this.store.set(args.where.ttsOrderId, record);
    return record;
  }

  async update(args: { where: { ttsOrderId: string }; data: Partial<OrderMapRecord> }) {
    const existing = await this.findUnique(args);
    if (!existing) {
      throw new Error('Order mapping not found');
    }
    const updated: OrderMapRecord = {
      ...existing,
      ...args.data,
      updatedAt: new Date(),
    };
    this.store.set(args.where.ttsOrderId, updated);
    return updated;
  }
}

class IdempotencyDelegate {
  private readonly store = new Map<string, IdempotencyRecord>();

  async findUnique(args: { where: { key: string } }): Promise<IdempotencyRecord | null> {
    return this.store.get(args.where.key) ?? null;
  }

  async create(args: { data: { key: string; payloadHash: string } }): Promise<IdempotencyRecord> {
    const record: IdempotencyRecord = {
      id: randomUUID(),
      key: args.data.key,
      payloadHash: args.data.payloadHash,
      processedAt: new Date(),
    };
    this.store.set(record.key, record);
    return record;
  }
}

const matchesWhere = (entry: any, where: any): boolean => {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR' && Array.isArray(value)) {
      return value.some((condition) => matchesWhere(entry, condition));
    }
    if (value && typeof value === 'object' && 'not' in value) {
      return entry[key] !== value.not;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return matchesWhere(entry[key] ?? {}, value);
    }
    return entry[key] === value;
  });
};
