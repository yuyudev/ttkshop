import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config';
export declare class TokenCryptoService {
    private readonly configService;
    private readonly key;
    constructor(configService: ConfigService<AppConfig>);
    encrypt(value: string): string;
    decrypt(payload: string): string;
}
