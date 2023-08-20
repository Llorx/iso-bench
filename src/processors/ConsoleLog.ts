import { StreamLog } from "./StreamLog";

export class ConsoleLog extends StreamLog {
    constructor() {
        super(process.stdout);
    }
}