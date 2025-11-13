import { Controller, Get, Header } from '@nestjs/common';
import { collectDefaultMetrics, register } from 'prom-client';

@Controller()
export class AppController {
  constructor() {
    collectDefaultMetrics();
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('metrics')
  @Header('Content-Type', register.contentType)
  async metrics(): Promise<string> {
    return register.metrics();
  }
}
