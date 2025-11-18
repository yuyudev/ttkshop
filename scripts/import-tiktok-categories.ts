import { promises as fs } from 'fs';
import * as path from 'path';

import { PrismaClient } from '@prisma/client';

interface RawCategory {
  id?: string | number;
  category_id?: string | number;
  categoryId?: string | number;
  value?: string | number;
  name?: string;
  category_name?: string;
  local_name?: string;
  label?: string;
  parent_id?: string | number;
  parentId?: string | number;
  is_leaf?: boolean;
  permission_statuses?: unknown;
  attributes?: unknown;
  required_attributes?: unknown;
  children?: RawCategory[];
  child?: RawCategory[];
  subCategories?: RawCategory[];
  [key: string]: any;
}

interface FlatCategory {
  id: string;
  parentId: string | null;
  name: string;
  fullPath: string;
  level: number;
  attributes?: unknown;
  version: string;
  isLeaf: boolean;
}

interface NormalizedCategory {
  id: string;
  parentId: string | null;
  name: string;
  isLeaf: boolean;
  raw: RawCategory;
}

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const fileArg = getArgValue(args, '--file') ?? args[0];
  const version = getArgValue(args, '--version') ?? new Date().toISOString();

  if (!fileArg) {
    throw new Error(
      'Missing --file argument. Usage: ts-node scripts/import-tiktok-categories.ts --file=path/to/categories.json [--version=v2025-01-01]',
    );
  }

  const absolutePath = path.resolve(process.cwd(), fileArg);
  const fileContent = await fs.readFile(absolutePath, 'utf-8');
  const parsed = JSON.parse(fileContent);
  const categories = normalizeRoot(parsed);

  if (!categories.length) {
    throw new Error('No categories found in the provided JSON file.');
  }

  const normalized = categories.map(normalizeCategory);
  const flattened = buildFlatCategories(normalized, version);

  if (!flattened.length) {
    throw new Error('Unable to flatten TikTok categories. Please verify the JSON schema.');
  }

  console.log(`Importing ${flattened.length} TikTok categories (version ${version})...`);

  await prisma.$transaction([
    prisma.tiktokCategory.deleteMany({}),
    prisma.tiktokCategory.createMany({
      data: flattened.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        name: item.name,
        fullPath: item.fullPath,
        level: item.level,
        attributes: item.attributes ?? undefined,
        version: item.version,
        isLeaf: item.isLeaf,
      })),
      skipDuplicates: true,
    }),
  ]);

  console.log('TikTok categories imported successfully.');
}

function normalizeCategory(category: RawCategory): NormalizedCategory {
  const candidate =
    category.id ??
    category.category_id ??
    category.categoryId ??
    category.value ??
    null;
  if (candidate === null || candidate === undefined) {
    throw new Error('Category entry is missing an identifier.');
  }
  const normalized = String(candidate).trim();
  if (!normalized) {
    throw new Error('Category entry has an empty identifier.');
  }
  const parentCandidate =
    category.parent_id ??
    category.parentId ??
    (typeof category.parent === 'object' ? (category.parent as any)?.id : category.parent);
  const parentId = normalizeParentId(parentCandidate);
  const name = extractName(category);
  const isLeaf = typeof category.is_leaf === 'boolean' ? category.is_leaf : false;

  return {
    id: normalized,
    parentId,
    name,
    isLeaf,
    raw: category,
  };
}

function extractName(category: RawCategory): string {
  const candidate =
    category.local_name ??
    category.name ??
    category.category_name ??
    category.label ??
    category.id;
  const normalized = String(candidate ?? '').trim();
  if (!normalized) {
    throw new Error(`Category ${JSON.stringify(category)} is missing a name/label.`);
  }
  return normalized;
}

function normalizeParentId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized || normalized === '0') {
    return null;
  }
  return normalized;
}

function normalizeRoot(input: unknown): RawCategory[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const candidate =
      obj.categories ??
      obj.data ??
      obj.result ??
      obj.items;
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const inner = (candidate as any).categories;
      if (Array.isArray(inner)) {
        return inner;
      }
    }
  }
  return [];
}

function buildFlatCategories(categories: NormalizedCategory[], version: string): FlatCategory[] {
  const nodesById = new Map<string, NormalizedCategory>();
  const memo = new Map<string, { path: string[]; level: number }>();
  const childCount = new Map<string, number>();

  for (const category of categories) {
    nodesById.set(category.id, category);
    if (category.parentId) {
      childCount.set(category.parentId, (childCount.get(category.parentId) ?? 0) + 1);
    }
  }

  const computePath = (category: NormalizedCategory): { path: string[]; level: number } => {
    if (memo.has(category.id)) {
      return memo.get(category.id)!;
    }

    if (!category.parentId) {
      const base = { path: [category.name], level: 0 };
      memo.set(category.id, base);
      return base;
    }

    const parentNode = nodesById.get(category.parentId);
    if (!parentNode) {
      const base = { path: [category.name], level: 0 };
      memo.set(category.id, base);
      return base;
    }

    const parentPath = computePath(parentNode);
    const current = { path: [...parentPath.path, category.name], level: parentPath.level + 1 };
    memo.set(category.id, current);
    return current;
  };

  return categories.map((category) => {
    const { path, level } = computePath(category);
    const fullPath = path.join(' > ');
    const hasChildren = (childCount.get(category.id) ?? 0) > 0;
    return {
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      fullPath,
      level,
      attributes:
        category.raw.attributes ??
        category.raw.required_attributes ??
        category.raw.permission_statuses ??
        null,
      version,
      isLeaf: typeof category.raw.is_leaf === 'boolean' ? category.raw.is_leaf : !hasChildren,
    };
  });
}

function getArgValue(args: string[], flag: string): string | undefined {
  const direct = args.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) {
    return direct.split('=')[1];
  }
  const index = args.findIndex((arg) => arg === flag);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Failed to import TikTok categories:', error);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
