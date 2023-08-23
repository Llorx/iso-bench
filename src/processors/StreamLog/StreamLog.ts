import STREAM from "stream";
import TTY from "tty";

import { Processor } from "../../Processor";
import { Test, Sample } from "../../Test";
import { IsoBench } from "../../IsoBench";
import { DynamicStream } from "./DynamicStream";
import { StaticStream } from "./StaticStream";

export class StreamLog implements Processor {
    private _log:Processor;
    constructor(stream:STREAM.Writable|TTY.WriteStream) {
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