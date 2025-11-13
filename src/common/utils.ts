import { createHash, randomUUID } from 'crypto';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const exponentialBackoff = (attempt: number, base = 250, max = 2000): number => {
  if (attempt <= 0) return base;
  return Math.min(base * 2 ** (attempt - 1), max);
};

export const createPayloadHash = (payload: unknown): string => {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  return createHash('sha256').update(serialized).digest('hex');
};

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const generateRequestId = (): string => randomUUID();
