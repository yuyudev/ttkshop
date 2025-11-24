import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AppModule } from '../src/app.module';
import { CatalogScheduler } from '../src/catalog/catalog.scheduler';

function parseArgs(): { shopId: string; startProductId?: string } {
  const args = process.argv.slice(2);
  let shopId: string | undefined;
  let startProductId: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--shop=')) {
      shopId = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--start=')) {
      startProductId = arg.split('=')[1];
      continue;
    }
  }

  if (!shopId && args[0]) {
    shopId = args[0];
  }

  if (!shopId) {
    throw new Error('Usage: npm run catalog:sync-all -- --shop=SHOP_ID [--start=PRODUCT_ID]');
  }

  return { shopId, startProductId };
}

async function bootstrap() {
  const { shopId, startProductId } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const scheduler = app.get(CatalogScheduler);
  const logger = new Logger('CatalogSyncCLI');

  try {
    logger.log(
      `Starting full catalog sync for shopId=${shopId}${startProductId ? ` from productId=${startProductId}` : ''}`,
    );
    await scheduler.syncAllProducts(shopId, startProductId);
    logger.log(`Finished catalog sync for shopId=${shopId}`);
  } catch (error) {
    logger.error(`Failed to sync catalog for shopId=${shopId}`, error as any);
  } finally {
    await app.close();
  }
}

bootstrap();
