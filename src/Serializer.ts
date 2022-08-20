import * as V8 from "v8";

class Reader<T> {
    private _savedBuffer:Buffer|null = null;
    process(buffer:Buffer|null) {
        if (this._savedBuffer) {
            buffer = buffer ? Buffer.concat([this._savedBuffer, buffer]) : this._savedBuffer;
        }
        if (buffer) {
            if (buffer.length >= 8) {
                let size = buffer.readDoubleBE(0);
                if (buffer.length >= 8 + size) {
                    this._savedBuffer = buffer.length === (8 + size) ? null : buffer.subarray(8 + size);
                    return { data: size > 0 ? V8.deserialize(buffer.subarray(8, 8 + size)) as T : null };
                }
            }
        }
        this._savedBuffer = buffer;
        return null;
    }
}

export class Serializer {
    static serialize(data:any) {
        let res = V8.serialize(data);
        let size = Buffer.allocUnsafe(8);
        size.writeDoubleBE(res.length);
        return Buffer.concat([size, res]);
    }
    static getReader<T = any>() {
        return new Reader<T>();
    }
}