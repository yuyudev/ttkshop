import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config';
export declare class VtexOrdersClient {
    private readonly http;
    private readonly configService;
    private readonly account;
    private readonly environment;
    private readonly domainOverride?;
    constructor(http: HttpService, configService: ConfigService<AppConfig>);
    createOrder(payload: unknown): Promise<import("axios").AxiosResponse<any, unknown, {}>>;
    getOrder(orderId: string): Promise<import("axios").AxiosResponse<any, any, {}>>;
    updateTracking(orderId: string, payload: unknown): Promise<import("axios").AxiosResponse<any, unknown, {}>>;
    private baseUrl;
    private headers;
}
