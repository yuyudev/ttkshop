import { promises as fs } from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/catalog/catalog.service';

function parseArgs(): { shopId: string; filePath: string } {
  const args = process.argv.slice(2);
  let shopId: string | undefined;
  let filePath: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--shop=')) {
      shopId = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--file=')) {
      filePath = arg.split('=')[1];
      continue;
    }
  }

  if (!shopId && args[0]) {
    shopId = args[0];
  }
  if (!filePath && args[1]) {
    filePath = args[1];
  }

  if (!shopId || !filePath) {
    throw new Error(
      'Usage: npm run catalog:sync-file -- --shop=SHOP_ID --file=/path/to/ids.txt',
    );
  }

  return { shopId, filePath };
}

function parseProductIds(contents: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const token = line.split(/\s+/)[0];
    if (!token) {
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      ids.push(token);
    }
  }

  return ids;
}

async function bootstrap() {
  const { shopId, filePath } = parseArgs();
  const absolutePath = path.resolve(process.cwd(), filePath);
  const contents = await fs.readFile(absolutePath, 'utf-8');
  const productIds = parseProductIds(contents);

  if (!productIds.length) {
    throw new Error(`No product IDs found in file: ${absolutePath}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const catalogService = app.get(CatalogService);
  const logger = new Logger('CatalogSyncFileCLI');

  let success = 0;
  let failed = 0;

  try {
    logger.log(`Starting file-based catalog sync for shopId=${shopId}`);
    logger.log(`Loaded ${productIds.length} product IDs from ${absolutePath}`);

    for (const productId of productIds) {
      try {
        await catalogService.syncProduct(shopId, productId);
        success += 1;
      } catch (error) {
        failed += 1;
        logger.error(`Failed to sync productId=${productId}`, error as any);
      }
    }

    logger.log(
      `Finished file-based catalog sync for shopId=${shopId}. success=${success} failed=${failed}`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
