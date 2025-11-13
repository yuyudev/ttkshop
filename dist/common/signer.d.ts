export declare function createTikTokSignature(secret: string, path: string, params: Record<string, string | number | boolean | undefined>, body?: any): string;
export declare function buildSignedQuery(appKey: string, secret: string, path: string, params?: Record<string, string | number | boolean | undefined>, body?: any): URLSearchParams;
