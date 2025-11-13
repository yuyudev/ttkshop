import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { createPayloadHash } from './utils';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async alreadyProcessed(key: string): Promise<boolean> {
    const existing = await this.prisma.idempotency.findUnique({
      where: { key },
      select: { id: true },
    });

    return Boolean(existing);
  }

  async register<TPayload>(
    key: string,
    payload: TPayload,
    handler: () => Promise<void>,
  ): Promise<'skipped' | 'processed'> {
    const payloadHash = createPayloadHash(payload);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.idempotency.findUnique({
        where: { key },
      });

      if (existing) {
        return 'skipped';
      }

      await handler();

      await tx.idempotency.create({
        data: {
          key,
          payloadHash,
        },
      });

      return 'processed';
    });
  }
}
