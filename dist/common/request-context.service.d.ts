export interface RequestContext {
    requestId: string;
}
export declare class RequestContextService {
    private readonly storage;
    runWithRequestId<T>(requestId: string, callback: () => Promise<T> | T): Promise<T> | T;
    getRequestId(): string;
}
