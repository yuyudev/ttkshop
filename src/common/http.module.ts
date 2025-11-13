import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { setTimeout } from 'timers/promises';

import { AppConfig } from './config';
import { RequestContextService } from './request-context.service';

const shouldRetryStatus = new Set([408, 429, 500, 502, 503, 504]);

@Injectable()
class HttpClientConfigurator implements OnModuleInit {
  private readonly maxRetries: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly requestContext: RequestContextService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HttpClientConfigurator.name);
    this.maxRetries = this.configService.get<number>('HTTP_MAX_RETRIES', { infer: true }) ?? 3;
  }

  onModuleInit(): void {
    const axios = this.httpService.axiosRef;

    axios.interceptors.request.use((config) => {
      const requestId = this.requestContext.getRequestId();
      config.headers = config.headers ?? {};
      config.headers['x-request-id'] = requestId;

      this.logger.debug(
        {
          msg: 'HTTP request',
          method: config.method,
          url: config.url,
          retryCount: (config as RetryAwareConfig).__retryCount ?? 0,
          requestId,
        },
        'http_request',
      );

      return config;
    });

    axios.interceptors.response.use(
      (response) => {
        this.logger.debug(
          {
            msg: 'HTTP response',
            method: response.config.method,
            url: response.config.url,
            status: response.status,
          },
          'http_response',
        );
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as RetryAwareConfig | undefined;
        const retryCount = config?.__retryCount ?? 0;
        const status = error.response?.status;

        const safeError = {
          message: error.message,
          status,
          code: error.code,
          url: error.config?.url,
          method: error.config?.method,
        };
        this.logger.error({ err: safeError }, 'HTTP request failed');

        if (!config || retryCount >= this.maxRetries || !this.isRetriable(error)) {
          throw error;
        }

        config.__retryCount = retryCount + 1;
        const delayMs = this.getBackoffDelay(config.__retryCount);
        await setTimeout(delayMs);
        return axios.request(config);
      },
    );
  }

  private getBackoffDelay(attempt: number): number {
    const base = 250;
    const max = 2000;
    return Math.min(base * 2 ** (attempt - 1), max);
  }

  private isRetriable(error: AxiosError): boolean {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    const status = error.response?.status;
    return status ? shouldRetryStatus.has(status) : false;
  }
}

interface RetryAwareConfig extends AxiosRequestConfig {
  __retryCount?: number;
}


@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        timeout: config.get<number>('REQUEST_TIMEOUT_MS'),
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [HttpClientConfigurator, RequestContextService],
  exports: [HttpModule, RequestContextService],
})
export class HttpClientModule {}
