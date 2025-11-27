import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppConfig } from '../common/config';
export declare class VtexOrdersClient {
    private readonly http;
    private readonly configService;
    private readonly logger;
    private readonly account;
    private readonly environment;
    private readonly domainOverride?;
    constructor(http: HttpService, configService: ConfigService<AppConfig>, logger: PinoLogger);
    createOrder(payload: unknown): Promise<import("axios").AxiosResponse<any, unknown, {}>>;
    getOrder(orderId: string): Promise<import("axios").AxiosResponse<any, any, {}>>;
    simulateOrder(items: any[], postalCode: string, country: string): Promise<import("axios").AxiosResponse<any, {
        items: {
            id: any;
            quantity: any;
            seller: any;
        }[];
        postalCode: string;
        country: string;
    }, {}>>;
    updateTracking(orderId: string, invoiceData: any): Promise<import("axios").AxiosResponse<any, any, {}>>;
    private baseUrl;
    private headers;
}
