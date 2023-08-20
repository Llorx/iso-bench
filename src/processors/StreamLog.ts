import STREAM from "stream";

import { Processor } from "../Processor";
import { STRINGS } from "../STRINGS";
import { Test, Sample } from "../Test";
import { IsoBench } from "../IsoBench";

class BaseStream {
    constructor(protected _stream:STREAM.Writable) {}
}
class StaticStream extends BaseStream implements Processor {
    private _padding = 0;
    initialize(bench:IsoBench, tests:Test[]) {
        this._padding = Math.max(...tests.map(test => test.name.length));
        this._stream.write(STRINGS.INITIALIZED + " " + bench.name + "\n");
    }
    end(test:Test) {
        const logArgs = this._getTestLog(test);
        this._stream.write(logArgs.join(" ") + "\n");
    }
    completed(tests:Test[]) {
        this._stream.write("---" + "\n");
        this._stream.write(STRINGS.COMPLETED + "\n");
        const ops = tests.map(test => test.opMs);
        const min = Math.min(...ops.filter(n => !!n));
        const max = Math.max(...ops.filter(n => !!n));
        for (const test of tests) {
            const logArgs = this._getTestLog(test);
            if (!test.error) {
                logArgs.push(`${(test.opMs / min).toFixed(3)}x`);
                if (test.opMs === min) {
                    logArgs.push(`(${STRINGS.WORSE})`);
                } else if (test.opMs === max) {
                    logArgs.push(`(${STRINGS.BEST})`);
                }
            }
            this._stream.write(logArgs.join(" ") + "\n");
        }
    }
    private _getTestLog(test:Test) {
        const logArgs:unknown[] = [test.name.padEnd(this._padding, " "), "-"];
        if (test.error) {
            logArgs.push(test.error);
        } else {
            logArgs.push(Math.round(test.opMs*1000).toLocaleString());
            if (test.samples.length > 1) {
                logArgs.push("op/s.", test.samples.length, "samples in");
            } else {
                logArgs.push("op/s in");
            }
            logArgs.push(Math.round(test.totalTime), "ms.");
        }
        return logArgs;
    }
}
/*class DynamicStream extends BaseStream implements Processor {
    end(test:Test) {
        return this._log.end(test);
    }
}*/
export class StreamLog implements Processor {
    private _log:Processor;
    constructor(stream:STREAM.Writable) {
        this._log = /*("isTTY" in stream && stream.isTTY) ? new DynamicStream(stream) : */new StaticStream(stream);
    }
    initialize(bench:IsoBench, tests:Test[]) {
        return this._log.initialize && this._log.initialize(bench, tests);
    }
    start(test:Test) {
        return this._log.start && this._log.start(test);
    }
    sample(test:Test, sample:Sample) {
        return this._log.sample && this._log.sample(test, sample);
    }
    end(test:Test) {
        return this._log.end && this._log.end(test);
    }
    completed(tests:Test[]) {
        return this._log.completed && this._log.completed(tests);
    }
}