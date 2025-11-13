export declare class AppController {
    constructor();
    health(): {
        status: string;
    };
    metrics(): Promise<string>;
}
