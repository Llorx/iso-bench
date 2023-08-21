import STREAM from "stream";
import TTY from "tty";

import { Processor } from "../Processor";
import { STRINGS } from "../STRINGS";
import { Test, Sample } from "../Test";
import { IsoBench } from "../IsoBench";

const enum COLORS {
    CLEAR = "\x1b[0m",
    GRAY = "\x1b[30m",
    RED = "\x1b[31m",
    GREEN = "\x1b[32m",
    YELLOW = "\x1b[33m",
    BLUE = "\x1b[36m"
}
function formatColor(str:string, color:COLORS, useColor:boolean) {
    return useColor ? `${color}${str}${COLORS.CLEAR}` : str;
}
function _getTestLog(padding:number, test:Test, minMax?:{min:number, max:number}|null, useColor = false) {
    const logArgs:unknown[] = [test.name.padEnd(padding, " "), "-"];
    if (test.error) {
        logArgs.push(formatColor(test.error, COLORS.RED, useColor));
    } else {
        logArgs.push(formatColor(Math.round(test.opMs*1000).toLocaleString(), COLORS.BLUE, useColor));
        if (test.samples.length > 1) {
            logArgs.push("op/s.", formatColor(String(test.samples.length), COLORS.BLUE, useColor), "samples in");
        } else {
            logArgs.push("op/s in");
        }
        logArgs.push(formatColor(String(Math.round(test.totalTime)), COLORS.BLUE, useColor), "ms.");
        if (minMax) {
            logArgs.push(formatColor(`${(test.opMs / minMax.min).toFixed(3)}x`, COLORS.BLUE, useColor));
            if (test.opMs === minMax.min) {
                logArgs.push(formatColor(`(${STRINGS.WORSE})`, COLORS.YELLOW, useColor));
            } else if (test.opMs === minMax.max) {
                logArgs.push(formatColor(`(${STRINGS.BEST})`, COLORS.GREEN, useColor));
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
    private _outputs = new Map<number, TestOutput>;
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
        this._header.log(`${COLORS.YELLOW}${STRINGS.INITIALIZED}${COLORS.CLEAR} ${this._benchName}`);
        for (let i = 0; i < tests.length; i++) {
            const output = new TestOutput(this._cursor, i + 1);
            output.log(`${tests[i].name.padEnd(this._padding, " ")} - ${COLORS.GRAY}Paused${COLORS.CLEAR}`);
            this._outputs.set(tests[i].name, output);
        }
    }
    start(test:Test) {
        const output = this._outputs.get(test.name);
        const output = this._outputs.get(test.index);
        if (output) {
            output.log(`${test.name.padEnd(this._padding, " ")} - ${COLORS.YELLOW}Running...${COLORS.CLEAR}`);
        }
    }
    end(test:Test) {
        const output = this._outputs.get(test.index);
        if (output) {
            const logArgs = _getTestLog(this._padding, test, null, true);
            output.log(logArgs.join(" "));
        }
    }
    completed(tests:Test[]): void {
        this._header.log(`${COLORS.GREEN}${STRINGS.COMPLETED}${COLORS.CLEAR} ${this._benchName}`);
        const ops = tests.map(test => test.opMs);
        const min = Math.min(...ops.filter(n => !!n));
        const max = Math.max(...ops.filter(n => !!n));
        for (const test of tests) {
            const output = this._outputs.get(test.name);
            if (output) {
                const logArgs = _getTestLog(this._padding, test, { min, max }, true);
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