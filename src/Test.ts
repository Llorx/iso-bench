import STREAM from "stream";
import CHILD_PROCESS from "child_process";

import { STRINGS } from "./STRINGS";
import { Fork } from "./Fork";
import { IsoBenchOptions } from ".";
import { SetupMessage } from "./WorkerSetup";

export type RunMessage = {
    error:string;
}|{
    diff:number;
    cycles:number;
    warmUpCycles:number;
};

class ForkContext {
    private _ended = false;
    constructor(private _test:Test, private _resolve:()=>void, private _benchName:string, private _options:Required<IsoBenchOptions>) {}
    start() {
        // Start worker
        const setup:SetupMessage = {
            testName: this._test.name,
            benchName: this._benchName,
            cycles: this._test.cycles,
            warmUpCycles: this._test.warmUpCycles,
            time: this._options.time,
            warmUpTime: this._options.warmUpTime,
            first: this._test.samples.length === 0
        };
        const worker = Fork.fork({
            [STRINGS.ISO_BENCH_SETUP]: JSON.stringify(setup)
        });
        this._listenForCompletionMessage(worker.stdio[3] as STREAM.Readable);
        this._listenForProcessExit(worker);
    }
    private _done(error?:string, diff?:number, cycles?:number, warmUpCycles?:number) {
        if (!this._ended) {
            this._ended = true;
            if (cycles) {
                this._test.cycles = cycles;
            }
            if (warmUpCycles) {
                this._test.warmUpCycles = warmUpCycles;
            }
            if (error) {
                this._test.opMs = 0;
                this._test.error = error;
                this._resolve();
            } else if (diff) {
                this._test.samples.push({
                    cycles: this._test.cycles,
                    time: diff,
                    ops: this._test.cycles / diff
                });
                const ops = this._test.cycles / diff;
                this._test.opMs = this._test.opMs < 0 ? ops : (this._test.opMs + ops) / 2;
                this._test.totalTime += diff;
                if (this._test.samples.length >= this._options.samples) {
                    this._test.opMs = this._test.samples.reduce((total, sample) => total + sample.ops, 0) / this._test.samples.length; 
                    this._resolve();
                } else {
                    this.start();
                }
            }
        }
    }
    private _listenForCompletionMessage(stream:STREAM.Readable) {
        let size:number|null = null;
        stream.on("readable", () => {
            try {
                while(stream.readable) {
                    if (size == null) {
                        const buffer = stream.read(2);
                        if (buffer && buffer.length === 2) {
                            size = buffer.readUint16LE();
                        } else {
                            break;
                        }
                    } else {
                        const buffer = stream.read(size);
                        if (buffer && buffer.length === size) {
                            const message = JSON.parse(String(buffer)) as RunMessage;
                            if ("error" in message) {
                                this._done(message.error);
                            } else {
                                this._done("", message.diff, message.cycles, message.warmUpCycles);
                            }
                        }
                        break;
                    }
                }
            } catch (e) {
                this._done(String(e));
            }
        });
    }
    private _listenForProcessExit(worker:CHILD_PROCESS.ChildProcess) {
        // Save stderr information just in case it exits prematurely
        const errBuffer:Buffer[] = [];
        worker.stderr!.on("data", data => errBuffer.push(data));
        worker.on("exit", (code) => {
            let err = `Process ended prematurely. Exit code: ${code}`;
            if (errBuffer.length > 0) {
                err = `${err}. Error: ${Buffer.concat(errBuffer).toString()}`;
            }
            this._done(err);
        });
    }
}
export class Test {
    error:string|null = null;
    log:any[] = [];
    cycles = 1;
    warmUpCycles = 1;
    opMs = -1;
    totalTime = 0;
    samples:{cycles: number, time:number, ops:number}[] = [];
    constructor(readonly name:string, private _callback:()=>void) {}
    fork(benchName:string, options:Required<IsoBenchOptions>) {
        return new Promise<void>((resolve => {
            // Start new context for this specific fork run
            const forkContext = new ForkContext(this, resolve, benchName, options);
            forkContext.start();
        }));
    }
    run(setup:SetupMessage) {
        const warmUpResult = setup.warmUpTime > 0 ? this._getResult(setup.warmUpTime, setup.warmUpCycles) : null;
        if (setup.first && warmUpResult) {
            // Use the warmup cycles to calculate the result cycles
            const ratio = (setup.warmUpTime / setup.time) * 1.02;
            setup.cycles = warmUpResult.cycles * ratio;
        }
        const result = this._getResult(setup.time, setup.cycles);
        const runResult:RunMessage = {
            diff: result.diff,
            cycles: result.cycles,
            warmUpCycles: warmUpResult ? warmUpResult.cycles : 0
        };
        return runResult;
    }
    private _getResult(targetTime:number, cycles:number) {
        let diff:number;
        while(true) {
            diff = this._getCallbackTime(cycles);
            if (diff >= targetTime) {
                break;
            } else {
                const ratio = (targetTime / diff) * 1.02; // Add a 2% extra, just in case it is not enough
                cycles = Math.ceil(cycles * ratio);
            }
        }
        return {cycles, diff};
    }
    private _getCallbackTime(cycles:number) {
        const startTS = process.hrtime.bigint();
        while(cycles-- > 0) {
            this._callback();
        }
        return Number(process.hrtime.bigint() - startTS) / 1000000;
    }
}