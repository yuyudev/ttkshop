import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';
export declare class TiktokOrderClient {
    private readonly http;
    private readonly configService;
    private readonly tiktokShopService;
    private readonly openBase;
    private readonly appKey;
    private readonly appSecret;
    private readonly shopCipher;
    constructor(http: HttpService, configService: ConfigService<AppConfig>, tiktokShopService: TiktokShopService);
    listOrders(shopId: string, params?: Record<string, string>): Promise<import("axios").AxiosResponse<any, any, {}>>;
    getOrder(shopId: string, orderId: string): Promise<import("axios").AxiosResponse<any, any, {}>>;
    ackOrder(shopId: string, orderId: string): Promise<import("axios").AxiosResponse<any, any, {}>>;
    private request;
    private isExpiredError;
    private withTokenRetry;
}
