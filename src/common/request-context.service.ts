import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface RequestContext {
  requestId: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  runWithRequestId<T>(requestId: string, callback: () => Promise<T> | T): Promise<T> | T {
    const ctx: RequestContext = { requestId };
    return this.storage.run(ctx, callback);
  }

  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? randomUUID();
  }
}
