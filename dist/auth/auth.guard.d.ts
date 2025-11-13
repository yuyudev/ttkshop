import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../common/config';
export declare class ApiKeyAuthGuard implements CanActivate {
    private readonly configService;
    constructor(configService: ConfigService<AppConfig>);
    canActivate(context: ExecutionContext): boolean;
}
