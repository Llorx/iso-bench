import FS from "fs";

import { WorkerSetup } from "./WorkerSetup";

export type RunMessage = {
    error:string;
}|{
    error?:null;
    done:true;
}|{
    error?:null;
    done?:null;
    diff:number;
    cycles:number;
};

const output = WorkerSetup ? FS.createWriteStream("", { fd: 3 }) : null;
export namespace Messager {
    export function send(message:RunMessage) {
        if (!output) {
            throw new Error("No output?");
        }
        const bufferLength = Buffer.allocUnsafe(2);
        const buffer = Buffer.from(JSON.stringify(message));
        bufferLength.writeUint16LE(buffer.length);
        return new Promise<Error|null|undefined>(resolve => {
            output.write(Buffer.concat([bufferLength, buffer]), resolve);
        });
    }
}