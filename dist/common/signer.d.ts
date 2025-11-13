export interface TikTokRequestOptions {
    uri: string;
    qs?: Record<string, any>;
    headers?: Record<string, string | undefined>;
    body?: any;
}
export declare function generateTikTokSign(requestOption: TikTokRequestOptions, appSecret: string): string;
export declare function buildSignedRequest(baseOpenUrl: string, path: string, appKey: string, appSecret: string, options: {
    qs?: Record<string, any>;
    headers?: Record<string, string>;
    body?: any;
}): {
    url: string;
    headers: Record<string, string>;
    body?: any;
};
