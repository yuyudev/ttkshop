export declare const createTikTokSignature: (secret: string, path: string, params: Record<string, string | number | boolean | undefined>) => string;
export declare const buildSignedQuery: (appKey: string, secret: string, path: string, params: Record<string, string | number | boolean | undefined>) => URLSearchParams;
