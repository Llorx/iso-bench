/// <reference types="node" />
declare class Reader<T> {
    private _savedBuffer;
    process(buffer: Buffer | null): {
        data: T | null;
    } | null;
}
export declare class Serializer {
    static serialize(data: any): Buffer;
    static getReader<T = any>(): Reader<T>;
}
export {};
