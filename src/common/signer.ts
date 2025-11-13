import * as crypto from 'crypto';

/**
 * Gera a assinatura conforme o algoritmo de assinatura da TikTok Shop:
 *
 * 1. Remover `sign` e `access_token` dos parâmetros.
 * 2. Ordenar os parâmetros em ordem alfabética pelo nome.
 * 3. Concatenar cada par `key + value` em uma string contínua.
 * 4. Montar `stringToSign = path + concatenatedParams + bodyJson(opcional)`.
 * 5. Calcular `sign = HMAC-SHA256(stringToSign, appSecret)` em HEX.
 */
export function createTikTokSignature(
  secret: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  body?: any,
): string {
  // 1) Remove `sign` e `access_token`
  const keys = Object.keys(params).filter(
    (key) => key !== 'sign' && key !== 'access_token',
  );

  // 2) Ordena alfabeticamente
  keys.sort((a, b) => a.localeCompare(b));

  // 3) Concatena key + value (sem separador)
  let concatenated = '';
  for (const key of keys) {
    const value = params[key];
    if (value !== undefined && value !== null) {
      concatenated += `${key}${value}`;
    }
  }

  // 4) Monta stringToSign: path + parâmetros + body (se houver)
  let stringToSign = path + concatenated;

  if (body && Object.keys(body).length > 0) {
    // Usa JSON "seco", sem espaços extras
    stringToSign += JSON.stringify(body);
  }

  // 5) HMAC-SHA256 da stringToSign usando appSecret como chave
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(stringToSign, 'utf8');
  return hmac.digest('hex');
}

/**
 * Constrói a query assinada:
 *
 * - Sempre inclui `app_key`, `sign_method` e `timestamp`.
 * - Usa esses parâmetros (mais os extras) para gerar o `sign`.
 * - Depois adiciona o `sign` ao query string.
 */
export function buildSignedQuery(
  appKey: string,
  secret: string,
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  body?: any,
): URLSearchParams {
  const timestamp = Math.floor(Date.now() / 1000);

  // Parâmetros usados na assinatura
  const paramsForSignature: Record<string, string | number | boolean | undefined> = {
    app_key: appKey,
    sign_method: 'HmacSHA256',
    timestamp,
    ...params,
  };

  const sign = createTikTokSignature(secret, path, paramsForSignature, body);

  // Monta query final (incluindo sign)
  const query = new URLSearchParams();
  Object.entries({ ...paramsForSignature, sign }).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      query.append(k, String(v));
    }
  });

  return query;
}
