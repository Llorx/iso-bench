import STREAM from "stream";
import CHILD_PROCESS from "child_process";

import { Fork } from "./Fork";
import { RunMessage } from "./Messager";
import { Processor } from "./Processor";
import { SetupMessage } from "./WorkerSetup";
import { Sample, Test } from "./Test";
import { IsoBenchOptions } from "./IsoBench";

export class ForkContext {
    private _ended = false;
    constructor(private _test:Test, private _processors:Processor[], private _resolve:()=>void, private _benchName:string, private _options:Required<IsoBenchOptions>) {}
    start() {
        // Start worker
        const setup:SetupMessage = {
            testIndex: this._test.index,
            benchName: this._benchName,
            samples: Math.min(Math.ceil(this._options.samples * 0.1), this._options.samples - this._test.samples.length),
            time: this._options.time
        };
        const worker = Fork.fork({
            ["ISO_BENCH_SETUP"]: JSON.stringify(setup)
        });
        this._listenForCompletionMessage(worker.stdio[3] as STREAM.Readable);
        this._listenForProcessExit(worker);
    }
    private _processMessage(msg:RunMessage) {
        if (!this._ended) {
            if (msg.error != null) {
                this._test.opMs = 0;
                this._test.error = msg.error;
                this._ended = true;
                this._resolve();
            } else if (msg.done) {
                this._ended = true;
                if (this._test.samples.length >= this._options.samples) {
                    this._resolve();
                } else {
                    new ForkContext(this._test, this._processors, this._resolve, this._benchName, this._options).start();
                }
            } else {
                const sample:Sample = {
                    cycles: msg.cycles,
                    time: msg.diff,
                    ops: msg.cycles / msg.diff
                };
                this._test.samples.push(sample);
                this._test.totalTime += msg.diff;
                this._test.opMs = this._test.samples.reduce((total, sample) => total + sample.ops, 0) / this._test.samples.length;
                for (const processor of this._processors) {
                    processor.sample && processor.sample(this._test, sample);
                }
            }
        }
    }
    private _listenForCompletionMessage(stream:STREAM.Readable) {
        let size:number|null = null;
        stream.on("readable", () => {
            try {
                while(stream.readable) {
                    if (this._ended) {
                        break;
                    } else if (size == null) {
                        const buffer = stream.read(2);
                        if (buffer && buffer.length === 2) {
                            size = buffer.readUint16LE();
                        } else {
                            break;
                        }
                    } else {
                        const buffer = stream.read(size);
                        if (buffer && buffer.length === size) {
                            size = null;
                            const message = JSON.parse(String(buffer)) as RunMessage;
                            this._processMessage(message);
                        }
                    }
                }
            } catch (e) {
                this._processMessage({
                    error: String(e)
                });
            }
        });
    }
    private _listenForProcessExit(worker:CHILD_PROCESS.ChildProcess) {
        // Save stderr information just in case it exits prematurely
        const errBuffer:Buffer[] = [];
        worker.stderr!.on("data", data => errBuffer.push(data));
        worker.on("close", (code) => {
            let err = `Process ended prematurely. Exit code: ${code}`;
            if (errBuffer.length > 0) {
                err = `${err}. Error: ${Buffer.concat(errBuffer).toString()}`;
            }
            this._processMessage({
                error: err
            });
        });
    }
}