import STREAM from "stream";
import CHILD_PROCESS from "child_process";

import { STRINGS } from "./STRINGS";
import { Fork } from "./Fork";
import { IsoBenchOptions, Processor } from ".";
import { SetupMessage } from "./WorkerSetup";

export type RunMessage = {
    error:string;
}|{
    diff:number;
    cycles:number;
    warmUpCycles:number;
};
export type Sample = {
    cycles: number;
    time:number;
    ops:number;
};

class ForkContext<T> {
    private _ended = false;
    constructor(private _test:Test, private _processors:Processor[], private _resolve:()=>void, private _benchName:string, private _options:Required<IsoBenchOptions>) {}
    start() {
        // Start worker
        const setup:SetupMessage = {
            testI: this._test.index,
            benchName: this._benchName,
            cycles: this._test.cycles,
            warmUpCycles: this._test.warmUpCycles,
            time: this._options.time,
            warmUpTime: this._options.warmUpTime
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
                const sample:Sample = {
                    cycles: this._test.cycles,
                    time: diff,
                    ops: this._test.cycles / diff
                };
                this._test.samples.push(sample);
                for (const processor of this._processors) {
                    processor.sample && processor.sample(this._test, sample);
                }
                this._test.totalTime += diff;
                if (this._test.samples.length >= this._options.samples) {
                    this._test.opMs = this._test.samples.reduce((total, sample) => total + sample.ops, 0) / this._test.samples.length; 
                    this._resolve();
                } else {
                    new ForkContext(this._test, this._processors, this._resolve, this._benchName, this._options).start();
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
    cycles = 1;
    warmUpCycles = 1;
    opMs = 0;
    totalTime = 0;
    samples:Sample[] = [];
    constructor(readonly name:string, readonly index:number, private _callback:(setup?:unknown)=>void, private _setup?:()=>unknown) {}
    fork(benchName:string, processors:Processor[], options:Required<IsoBenchOptions>) {
        return new Promise<void>((resolve => {
            // Start new context for this specific fork run
            const forkContext = new ForkContext(this, processors, resolve, benchName, options);
            forkContext.start();
        }));
    }
    run(setup:SetupMessage) {
        const warmUpResult = setup.warmUpTime > 0 ? this._getResult(setup.warmUpTime, setup.warmUpCycles) : null;
        if (warmUpResult && warmUpResult.cycles !== setup.warmUpCycles) {
            // Use the warmup cycles to calculate the result cycles
            const ratio = (setup.time / setup.warmUpTime) * 1.02;
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
                const ratio = diff > 0 ? (targetTime / diff) * 1.02 : 1.1; // Go a 2% further, to avoid it ending just below the targetTime. Increase by 10% if zero is received (mostly in systems without nanosecond resolution)
                cycles = Math.ceil(cycles * ratio);
            }
        }
        return {cycles, diff};
    }
    private _getCallbackTime(cycles:number) {
        // Individual loops so the callback doesn't receive an argument if there's no setup
        if (this._setup) {
            const setup = this._setup();
            const startTS = process.hrtime.bigint();
            while(cycles-- > 0) {
                this._callback(setup);
            }
            return Number(process.hrtime.bigint() - startTS) / 1000000;
        } else {
            const startTS = process.hrtime.bigint();
            while(cycles-- > 0) {
                this._callback();
            }
            return Number(process.hrtime.bigint() - startTS) / 1000000;
        }
    }
}