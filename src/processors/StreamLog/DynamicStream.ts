import TTY from "tty";

import { Processor } from "../../Processor";
import { Test, Sample } from "../../Test";
import { IsoBench } from "../../IsoBench";
import { Group, getTestLog, COLORS } from "./Utils";
import { StreamTTY } from "./StreamTTY";

export class TestOutput {
    constructor(private _tty:StreamTTY, readonly line:number) {}
    log(data:string) {
        this._tty.log(data, this.line);
    }
}
export class DynamicStream implements Processor {
    private _padding = 0;
    private _outputs = new Map<number, TestOutput>;
    private _header;
    private _tty;
    private _benchName = "";
    private _groups = new Map<string, Group>();
    constructor(protected _stream:TTY.WriteStream) {
        this._tty = new StreamTTY(this._stream);
        this._header = new TestOutput(this._tty, 0);
    }
    initialize(bench:IsoBench, tests:Test[]) {
        let firstGroupName = "";
        for (const test of tests) {
            const group = this._groups.get(test.group);
            if (group) {
                group.tests.push(test);
            } else {
                firstGroupName = test.group;
                this._groups.set(test.group, {
                    name: test.group,
                    tests: [test],
                    started: 0,
                    ended: 0
                });
            }
        }
        this._benchName = bench.name;
        this._padding = Math.max(...tests.map(test => test.name.length));
        let line = 1;
        this._header.log(`${COLORS.YELLOW}[ISOBENCH INITIALIZED]${COLORS.CLEAR} ${this._benchName}`);
        for (const group of this._groups.values()) {
            if (this._groups.size > 1 || group.name) {
                group.output = new TestOutput(this._tty, line++);
                group.output.log(`${COLORS.GRAY}[GROUP PAUSED]${COLORS.CLEAR} ${group.name}`);
            }
            for (const test of group.tests) {
                const output = new TestOutput(this._tty, line++);
                output.log(`${test.name.padEnd(this._padding, " ")} - ${COLORS.GRAY}Paused${COLORS.CLEAR}`);
                this._outputs.set(test.index, output);
            }
        }
    }
    start(test:Test) {
        const group = this._groups.get(test.group);
        if (group) {
            group.started++;
            if (group.started === 1 && group.output) {
                group.output.log(`${COLORS.YELLOW}[GROUP INITIALIZED]${COLORS.CLEAR} ${group.name}`);
            }
        }
        const output = this._outputs.get(test.index);
        if (output) {
            output.log(`${test.name.padEnd(this._padding, " ")} - ${COLORS.YELLOW}Running...${COLORS.CLEAR}`);
        }
    }
    sample(test:Test, sample:Sample) {
        const output = this._outputs.get(test.index);
        if (output) {
            const logArgs = getTestLog(this._padding, test, null, true, sample);
            logArgs.push(`${COLORS.YELLOW}Running...${COLORS.CLEAR}`);
            output.log(logArgs.join(" "));
        }
    }
    end(test:Test) {
        const output = this._outputs.get(test.index);
        if (output) {
            const logArgs = getTestLog(this._padding, test, null, true);
            output.log(logArgs.join(" "));
        }
        const group = this._groups.get(test.group);
        if (group) {
            group.ended++;
            if (group.ended === group.tests.length) {
                this._completedGroup(group);
            }
        }
    }
    private _completedGroup(group:Group) {
        if (group.output) {
            group.output.log(`${COLORS.GREEN}[GROUP ENDED]${COLORS.CLEAR} ${group.name}`);
        }
        const ops = group.tests.map(test => test.opMs);
        const min = Math.min(...ops.filter(n => !!n));
        const max = Math.max(...ops.filter(n => !!n));
        for (const test of group.tests) {
            const output = this._outputs.get(test.index);
            if (output) {
                const logArgs = getTestLog(this._padding, test, { min, max }, true);
                output.log(logArgs.join(" "));
            }
        }
    }
    completed(tests:Test[]): void {
        this._header.log(`${COLORS.GREEN}[ISOBENCH ENDED]${COLORS.CLEAR} ${this._benchName}`);
        this._tty.end();
    }
}