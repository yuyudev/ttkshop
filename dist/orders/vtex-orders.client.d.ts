import { HttpService } from '@nestjs/axios';
import { PinoLogger } from 'nestjs-pino';
import { ShopConfigService } from '../common/shop-config.service';
export declare class VtexOrdersClient {
    private readonly http;
    private readonly shopConfigService;
    private readonly logger;
    constructor(http: HttpService, shopConfigService: ShopConfigService, logger: PinoLogger);
    createOrder(shopId: string, payload: unknown): Promise<import("axios").AxiosResponse<any, unknown, {}>>;
    getOrder(shopId: string, orderId: string): Promise<import("axios").AxiosResponse<any, any, {}>>;
    simulateOrder(shopId: string, items: any[], postalCode: string, country: string): Promise<import("axios").AxiosResponse<any, {
        items: Record<string, unknown>[];
        postalCode: string;
        country: string;
    }, {}>>;
    updateTracking(shopId: string, orderId: string, invoiceData: any): Promise<import("axios").AxiosResponse<any, any, {}>>;
    authorizeDispatch(shopId: string, orderId: string): Promise<import("axios").AxiosResponse<any, null, {}>>;
    private buildBaseUrl;
    private buildHeaders;
}
