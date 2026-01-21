import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z, ZodSchema } from 'zod';

export const catalogSyncSchema = z.object({
  updatedFrom: z.string().datetime().optional(),
});
export type CatalogSyncDto = z.infer<typeof catalogSyncSchema>;

export const inventorySyncSchema = z.object({
  skuIds: z.array(z.string()).optional(),
  warehouseId: z.string().optional(),
});
export type InventorySyncDto = z.infer<typeof inventorySyncSchema>;

export const orderWebhookSchema = z.object({
  type: z.number(),
  shop_id: z.string(),
  data: z.object({
    order_id: z.string(),
    order_status: z.string().optional(),
  }).passthrough(),
  timestamp: z.number().optional(),
}).passthrough();

export type OrderWebhookDto = z.infer<typeof orderWebhookSchema>;

export const tiktokWebhookSchema = z.object({
  type: z.number(),
  shop_id: z.string().optional(),
  data: z.unknown().optional(),
  timestamp: z.number().optional(),
}).passthrough();

export type TiktokWebhookDto = z.infer<typeof tiktokWebhookSchema>;

export const tikTokCallbackQuerySchema = z
  .object({
    auth_code: z.string().optional(),
    code: z.string().optional(),
    shop_id: z.string().optional(),
    state: z.string().optional(),
  })
  .refine((payload) => payload.auth_code || payload.code, {
    message: 'Auth code is required',
    path: ['auth_code'],
  });
export type TikTokCallbackQuery = z.infer<typeof tikTokCallbackQuerySchema>;

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) { }

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.format(),
      });
    }
    return result.data;
  }
}
