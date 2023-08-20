import STREAM from "stream";
import TTY from "tty";

import { Processor } from "../Processor";
import { STRINGS } from "../STRINGS";
import { Test, Sample } from "../Test";
import { IsoBench } from "../IsoBench";

function _getTestLog(padding:number, test:Test, minMax?:{min:number, max:number}) {
    const logArgs:unknown[] = [test.name.padEnd(padding, " "), "-"];
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
        if (minMax) {
            logArgs.push(`${(test.opMs / minMax.min).toFixed(3)}x`);
            if (test.opMs === minMax.min) {
                logArgs.push(`(${STRINGS.WORSE})`);
            } else if (test.opMs === minMax.max) {
                logArgs.push(`(${STRINGS.BEST})`);
            }
        }
    }
    return logArgs;
}
class StaticStream implements Processor {
    private _padding = 0;
    constructor(protected _stream:STREAM.Writable) {}
    initialize(bench:IsoBench, tests:Test[]) {
        this._padding = Math.max(...tests.map(test => test.name.length));
        this._stream.write(STRINGS.INITIALIZED + " " + bench.name + "\n");
    }
    end(test:Test) {
        const logArgs = _getTestLog(this._padding, test);
        this._stream.write(logArgs.join(" ") + "\n");
    }
    completed(tests:Test[]) {
        this._stream.write("---" + "\n");
        this._stream.write(STRINGS.COMPLETED + "\n");
        const ops = tests.map(test => test.opMs);
        const min = Math.min(...ops.filter(n => !!n));
        const max = Math.max(...ops.filter(n => !!n));
        for (const test of tests) {
            const logArgs = _getTestLog(this._padding, test, { min, max });
            this._stream.write(logArgs.join(" ") + "\n");
        }
    }
}
class Cursor {
    y = 0;
    last = 0;
    constructor(private _stream:TTY.WriteStream) {}
    moveTo(y:number) {
        const diff = y - this.y;
        this.y = y;
        if (diff) {
            this._stream.moveCursor(0, diff);
        }
    }
    write(line:number, data:string) {
        this.moveTo(line);
        this._stream.clearLine(0);
        this._stream.write(data + "\n");
        this.y++;
        if (this.last < this.y) {
            this.last = this.y;
        }
        this.moveTo(this.last);
    }
}
class TestOutput {
    constructor(private _cursor:Cursor, readonly line:number) {}
    log(data:string) {
        this._cursor.write(this.line, data);
    }
}
class DynamicStream implements Processor {
    private _padding = 0;
    private _outputs = new Map<string, TestOutput>;
    private _header;
    private _cursor;
    private _benchName = "";
    constructor(protected _stream:TTY.WriteStream) {
        this._cursor = new Cursor(this._stream);
        this._header = new TestOutput(this._cursor, 0);
    }
    initialize(bench:IsoBench, tests:Test[]) {
        this._benchName = bench.name;
        this._padding = Math.max(...tests.map(test => test.name.length));
        this._header.log(STRINGS.INITIALIZED + " " + this._benchName);
        for (let i = 0; i < tests.length; i++) {
            const output = new TestOutput(this._cursor, i + 1);
            output.log(`${tests[i].name.padEnd(this._padding, " ")} - Waiting...`);
            this._outputs.set(tests[i].name, output);
        }
    }
    start(test:Test) {
        const output = this._outputs.get(test.name);
        if (output) {
            output.log(`${test.name.padEnd(this._padding, " ")} - Running...`);
        }
    }
    end(test:Test) {
        const output = this._outputs.get(test.name);
        if (output) {
            const logArgs = _getTestLog(this._padding, test);
            output.log(logArgs.join(" "));
        }
    }
    completed(tests:Test[]): void {
        this._header.log(STRINGS.COMPLETED + " " + this._benchName);
        const ops = tests.map(test => test.opMs);
        const min = Math.min(...ops.filter(n => !!n));
        const max = Math.max(...ops.filter(n => !!n));
        for (const test of tests) {
            const output = this._outputs.get(test.name);
            if (output) {
                const logArgs = _getTestLog(this._padding, test, { min, max });
                output.log(logArgs.join(" "));
            }
        }
    }
}
export class StreamLog implements Processor {
    private _log:Processor;
    constructor(stream:STREAM.Writable) {
        this._log = ("isTTY" in stream && stream.isTTY) ? new DynamicStream(stream as TTY.WriteStream) : new StaticStream(stream);
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