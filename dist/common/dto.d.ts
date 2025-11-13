import { PipeTransform } from '@nestjs/common';
import { z, ZodSchema } from 'zod';
export declare const catalogSyncSchema: z.ZodObject<{
    updatedFrom: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    updatedFrom?: string | undefined;
}, {
    updatedFrom?: string | undefined;
}>;
export type CatalogSyncDto = z.infer<typeof catalogSyncSchema>;
export declare const inventorySyncSchema: z.ZodObject<{
    skuIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    warehouseId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    skuIds?: string[] | undefined;
    warehouseId?: string | undefined;
}, {
    skuIds?: string[] | undefined;
    warehouseId?: string | undefined;
}>;
export type InventorySyncDto = z.infer<typeof inventorySyncSchema>;
export declare const orderWebhookSchema: z.ZodObject<{
    event_type: z.ZodString;
    order_id: z.ZodString;
    shop_id: z.ZodString;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    shop_id: string;
    event_type: string;
    order_id: string;
    data?: Record<string, any> | undefined;
}, {
    shop_id: string;
    event_type: string;
    order_id: string;
    data?: Record<string, any> | undefined;
}>;
export type OrderWebhookDto = z.infer<typeof orderWebhookSchema>;
export declare const tikTokCallbackQuerySchema: z.ZodEffects<z.ZodObject<{
    auth_code: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    shop_id: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    auth_code?: string | undefined;
    shop_id?: string | undefined;
    state?: string | undefined;
}, {
    code?: string | undefined;
    auth_code?: string | undefined;
    shop_id?: string | undefined;
    state?: string | undefined;
}>, {
    code?: string | undefined;
    auth_code?: string | undefined;
    shop_id?: string | undefined;
    state?: string | undefined;
}, {
    code?: string | undefined;
    auth_code?: string | undefined;
    shop_id?: string | undefined;
    state?: string | undefined;
}>;
export type TikTokCallbackQuery = z.infer<typeof tikTokCallbackQuerySchema>;
export declare class ZodValidationPipe<T> implements PipeTransform {
    private readonly schema;
    constructor(schema: ZodSchema<T>);
    transform(value: unknown): T;
}
