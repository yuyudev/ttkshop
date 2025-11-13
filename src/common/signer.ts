import { createHmac } from 'crypto';

// TikTok Shop signature helper. API endpoints require parameters to be sorted alphabetically.
export const createTikTokSignature = (
  secret: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): string => {
  const filtered = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a > b ? 1 : -1));

  const query = filtered.map(([key, value]) => `${key}${value}`).join('');
  const payload = `${path}${query}`;
  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  return digest;
};

export const buildSignedQuery = (
  appKey: string,
  secret: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): URLSearchParams => {
  const baseParams = {
    app_key: appKey,
    sign: '',
    sign_method: 'HmacSHA256',
    timestamp: Math.floor(Date.now() / 1000),
    ...params,
  };

  const sign = createTikTokSignature(secret, path, baseParams);
  const query = new URLSearchParams();

  Object.entries({ ...baseParams, sign }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });

  return query;
};
