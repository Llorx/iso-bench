import STREAM from "stream";

import { Processor } from "../../Processor";
import { Test } from "../../Test";
import { IsoBench } from "../../IsoBench";
import { Group, getTestLog } from "./Utils";

export class StaticStream implements Processor {
    private _padding = 0;
    private _groups = new Map<string, Group>();
    constructor(protected _stream:STREAM.Writable) {}
    initialize(bench:IsoBench, tests:Test[]) {
        for (const test of tests) {
            const group = this._groups.get(test.group);
            if (group) {
                group.tests.push(test);
            } else {
                this._groups.set(test.group, {
                    name: test.group,
                    tests: [test],
                    started: 0,
                    ended: 0
                });
            }
        }
        this._padding = Math.max(...tests.map(test => test.name.length));
        this._stream.write(`[ISOBENCH INITIALIZED] ${bench.name}\n`);
    }
    end(test:Test) {
        const group = this._groups.get(test.group);
        if (group) {
            group.ended++;
            if (group.ended === group.tests.length) {
                this._completedGroup(group);
            }
        }
    }
    private _completedGroup(group:Group) {
        if (this._groups.size > 1 || group.name) {
            this._stream.write(`[GROUP COMPLETED] ${group.name}\n`);
        }
        const ops = group.tests.map(test => test.opMs);
        const min = Math.min(...ops.filter(n => !!n));
        const max = Math.max(...ops.filter(n => !!n));
        for (const test of group.tests) {
            const logArgs = getTestLog(this._padding, test, { min, max }, false);
            this._stream.write(logArgs.join(" ") + "\n");
        }
    }
    completed() {
        this._stream.write("[ISOBENCH COMPLETED]\n");
    }
}