import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AppConfig } from '../common/config';
import { PrismaService } from '../prisma/prisma.service';
import { TokenCryptoService } from '../common/token-crypto.service';
export declare class TiktokShopService {
    private readonly http;
    private readonly prisma;
    private readonly tokenCrypto;
    private readonly configService;
    private readonly authBase;
    private readonly appKey;
    private readonly appSecret;
    constructor(http: HttpService, prisma: PrismaService, tokenCrypto: TokenCryptoService, configService: ConfigService<AppConfig>);
    exchangeAuthorizationCode(code: string, explicitShopId?: string): Promise<{
        shopId: string;
        accessToken: string;
        refreshExpiresAt: Date;
    }>;
    refresh(shopId: string): Promise<string>;
    getAccessToken(shopId: string): Promise<string>;
    private calculateExpiry;
}
