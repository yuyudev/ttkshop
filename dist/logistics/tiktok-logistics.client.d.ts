import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config';
import { TiktokShopService } from '../auth/tiktokshop.service';
export declare class TiktokLogisticsClient {
    private readonly http;
    private readonly configService;
    private readonly tiktokShopService;
    private readonly servicesBase;
    constructor(http: HttpService, configService: ConfigService<AppConfig>, tiktokShopService: TiktokShopService);
    getOrCreateShippingDocument(shopId: string, orderId: string): Promise<import("axios").AxiosResponse<any, any, {}>>;
    getShippingDocument(shopId: string, orderId: string): Promise<import("axios").AxiosResponse<any, any, {}>>;
    private request;
}
