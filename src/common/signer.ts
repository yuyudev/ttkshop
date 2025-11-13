// src/common/signer.ts
import * as crypto from 'crypto';

const EXCLUDE_KEYS = ['access_token', 'sign'] as const;

export interface TikTokRequestOptions {
  uri: string;
  qs?: Record<string, any>;
  headers?: Record<string, string | undefined>;
  body?: any;
}

/**
 * Implementação idêntica à da doc oficial em Node:
 * https://partner.tiktokshop.com/docv2/page/sign-your-api-request
 */
export function generateTikTokSign(
  requestOption: TikTokRequestOptions,
  appSecret: string,
): string {
  let signString = '';

  // step1: query params (sem sign / access_token) ordenados
  const params = requestOption.qs || {};
  const sortedParams = Object.keys(params)
    .filter((key) => !EXCLUDE_KEYS.includes(key as any))
    .sort()
    .map((key) => ({ key, value: params[key] }));

  // step2: concat {key}{value}
  const paramString = sortedParams
    .map(({ key, value }) => `${key}${value}`)
    .join('');

  // step3: path da URL
  const pathname = new URL(requestOption.uri).pathname;
  signString = `${pathname}${paramString}`;

  // step4: se NÃO for multipart/form-data e tiver body => inclui body JSON
  const contentTypeHeader =
    requestOption.headers?.['content-type'] ??
    requestOption.headers?.['Content-Type'];

  const isMultipart =
    contentTypeHeader &&
    contentTypeHeader.toLowerCase().startsWith('multipart/form-data');

  if (!isMultipart && requestOption.body && Object.keys(requestOption.body).length) {
    const body = JSON.stringify(requestOption.body);
    signString += body;
  }

  // step5: wrap com app_secret
  signString = `${appSecret}${signString}${appSecret}`;

  // step6: HMAC-SHA256
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(signString);
  return hmac.digest('hex');
}

/**
 * Helper para montar URL assinada + headers + body,
 * seguindo o mesmo modelo de uso do `requestOption` da doc.
 */
export function buildSignedRequest(
  baseOpenUrl: string,
  path: string,
  appKey: string,
  appSecret: string,
  options: {
    qs?: Record<string, any>;
    headers?: Record<string, string>;
    body?: any;
  },
): { url: string; headers: Record<string, string>; body?: any } {
  const uri = `${baseOpenUrl}${path}`;

  const qs: Record<string, any> = {
    app_key: appKey,
    timestamp: Math.floor(Date.now() / 1000), // unix em segundos
    ...(options.qs ?? {}),
  };

  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  const requestOption: TikTokRequestOptions = {
    uri,
    qs,
    headers,
    body: options.body,
  };

  const sign = generateTikTokSign(requestOption, appSecret);
  qs.sign = sign;

  const search = new URLSearchParams();
  Object.entries(qs).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      search.append(k, String(v));
    }
  });

  return {
    url: `${uri}?${search.toString()}`,
    headers,
    body: options.body,
  };
}
