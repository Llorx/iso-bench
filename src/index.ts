import cluster, { ClusterSettings } from "cluster";
import FS from "fs";
import type STREAM from "stream";

type SetupMessage = {
    testName:string;
    benchName:string;
    cycles:number;
    warmUpCycles:number;
    time:number;
    warmUpTime:number;
    first:boolean;
};
type RunMessage = {
    error?:string;
    diff?:number;
    cycles?:number;
    warmUpCycles?:number;
};

interface ClusterSettingsWH extends ClusterSettings {
    windowsHide?:boolean;
}

function onRead(stream:STREAM.Readable, cb:(msg:any)=>void) {
    let buffer = Buffer.allocUnsafe(0);
    stream.on("data", (data:Buffer) => {
        buffer = Buffer.concat([buffer, data]);
        while (buffer.length >= 4) {
            const size = buffer.readUint32LE();
            if (buffer.length >= 4 + size) {
                const message = JSON.parse(buffer.slice(4, 4 + size).toString());
                buffer = buffer.slice(4 + size);
                cb(message);
            }
        }
    });
}
function send(stream:STREAM.Writable, data:SetupMessage|RunMessage) {
    const bufferLength = Buffer.allocUnsafe(4);
    const buffer = Buffer.from(JSON.stringify(data));
    bufferLength.writeUint32LE(buffer.length);
    stream.write(Buffer.concat([bufferLength, buffer]));
}

let writeStream:FS.WriteStream|null = null;
const isMaster = !!(cluster.isMaster || cluster.isPrimary);
if (isMaster) {
    const options:ClusterSettingsWH = {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe", "pipe", "ipc"]
    };
    if (cluster.setupPrimary) {
        cluster.setupPrimary(options);
    } else {
        cluster.setupMaster(options);
    }
} else {
    writeStream = FS.createWriteStream("", {fd: 3});
    onRead(FS.createReadStream("", {fd: 3}), (message:SetupMessage) => {
        updateIds(message);
    });
}

let setup:SetupMessage|null = null;
function updateIds(message:SetupMessage) {
    setup = message;
    const bench = BENCHES.get(setup.benchName);
    if (bench) {
        bench.run();
    }
}

export type IsoBenchOptions = {
    parallel?:number;
    samples?:number;
    time?:number;
    warmUpTime?:number;
};
const defaultOptions:Required<IsoBenchOptions> = {
    parallel: 1,
    samples: 1,
    time: 3000,
    warmUpTime: 500
};

class Test {
    error:string|null = null;
    log:any[] = [];
    cycles = 10;
    warmUpCycles = 1;
    opMs = -1;
    totalTime = 0;
    samples:{cycles: number, time:number, ops:number}[] = [];
    constructor(readonly name:string, readonly callback:()=>void) {}
}
export const enum STRINGS {
    WORSE = "WORSE",
    BEST = "BEST",
    COMPLETED = "[TESTS COMPLETED]"
};

let IDs = 0;
const BENCHES = new Map<string, IsoBench>();
export class IsoBench {
    tests = new Map<string, Test>();
    options:Required<IsoBenchOptions>;
    private _ready = 0;
    constructor(readonly name:string = "IsoBench", options?:IsoBenchOptions) {
        this.options = {...defaultOptions, ...options};
        let newName = name;
        while (BENCHES.has(newName)) {
            newName = `${name}_${IDs++}`;
        }
        BENCHES.set(newName, this);
        if (!isMaster && setup) {
            this.run();
        }
    }
    static IfMaster(cb:()=>void) {
        if (isMaster) {
            cb();
        }
    }
    add(name:string, callback:()=>void) {
        let newName = name;
        while (this.tests.has(newName)) {
            newName = `${name}_${IDs++}`;
        }
        this.tests.set(newName, new Test(newName, callback));
        return this;
    }
    async run() {
        if (isMaster) {
            const tests = this._getTests();
            let i = 0;
            await Promise.allSettled(new Array(this.options.parallel).fill(0).map(async () => {
                while(i < tests.length) {
                    await this._newWorker(tests[i++]);
                }
            }));
            for (const test of tests) {
                if (test.error) {
                    test.log = [test.error];
                } else if (test.samples.length > 1) {
                    test.log = [test.name, "-", Math.round(test.opMs*1000).toLocaleString(), "op/s.", test.samples.length, "samples in", Math.round(test.totalTime), "ms."];
                } else {
                    test.log = [test.name, "-", Math.round(test.opMs*1000).toLocaleString(), "op/s in", Math.round(test.totalTime), "ms."];
                }
            }
            this._output(tests);
            console.log(STRINGS.COMPLETED);
            return tests;
        } else if (++this._ready === 2) {
            if (setup) {
                this._start(setup);
            }
        }
        return null;
    }
    private _getTestResult(test:Test, targetTime:number, cycles:number) {
        let diff:number;
        while(true) {
            diff = this._runTest(test, cycles);
            if (diff >= targetTime) {
                break;
            } else {
                const ratio = (targetTime / diff) * 1.05;
                cycles = Math.ceil(cycles * ratio);
            }
        }
        return {cycles, diff};
    }
    private _start(setup:SetupMessage) {
        if (!writeStream) {
            throw new Error("No parent process");
        }
        if (this.name === setup.benchName) {
            try {
                const test = this.tests.get(setup.testName);
                if (!test) {
                    throw new Error("Test '" + setup.testName + "' not found");
                }
                const warmUpResult = setup.warmUpTime > 0 ? this._getTestResult(test, setup.warmUpTime, setup.warmUpCycles) : null;
                if (setup.first && warmUpResult) {
                    // Use the warmup cycles to calculate the result cycles
                    const ratio = (setup.warmUpTime / setup.time) * 1.05;
                    setup.cycles = warmUpResult.cycles * ratio;
                }
                const result = this._getTestResult(test, setup.time, setup.cycles);
                send(writeStream, {
                    diff: result.diff,
                    cycles: result.cycles,
                    warmUpCycles: warmUpResult ? warmUpResult.cycles : 0
                });
            } catch (e) {
                send(writeStream, {
                    error: String(e)
                });
            }
            process.exit();
        }
    }
    private _getTests() {
        return Array.from(this.tests.values());
    }
    private _output(tests:Test[]) {
        const ops = tests.map(test => test.opMs);
        const min = Math.min(...ops.filter(n => !!n));
        const max = Math.max(...ops.filter(n => !!n));
        for (const test of tests) {
            if (test.opMs > 0) {
                test.log.push(`${(test.opMs / min).toFixed(3)}x`);
                test.log.push(`${test.opMs === min ? `(${STRINGS.WORSE})` : ""}${test.opMs === max ? `(${STRINGS.BEST})` : ""}`);
            }
            console.log(...test.log);
        }
    }
    private _runTest(test:Test, cycles:number) {
        const startTS = process.hrtime.bigint();
        while(cycles-- > 0) {
            test.callback();
        }
        return Number(process.hrtime.bigint() - startTS) / 1000000;
    }
    private _newWorker(test:Test) {
        return new Promise<void>((resolve => {
            let ended = false;
            const worker = cluster.fork();
            const done = (error?:string, diff?:number, cycles?:number, warmUpCycles?:number) => {
                if (!ended) {
                    ended = true;
                    if (cycles) {
                        test.cycles = cycles;
                    }
                    if (warmUpCycles) {
                        test.warmUpCycles = warmUpCycles;
                    }
                    if (error) {
                        test.opMs = 0;
                        test.error = error;
                        resolve();
                    } else if (diff) {
                        test.samples.push({
                            cycles: test.cycles,
                            time: diff,
                            ops: test.cycles / diff
                        });
                        const ops = test.cycles / diff;
                        test.opMs = test.opMs < 0 ? ops : (test.opMs + ops) / 2;
                        test.totalTime += diff;
                        if (test.samples.length >= this.options.samples) {
                            test.opMs = test.samples.reduce((total, sample) => total + sample.ops, 0) / test.samples.length; 
                            resolve();
                        } else {
                            this._newWorker(test).then(resolve);
                        }
                    }
                }
            };
            onRead(worker.process.stdio[3]! as STREAM.Readable, (message:RunMessage) => {
                done(message.error, message.diff, message.cycles, message.warmUpCycles);
            });
            const errBuffer:Buffer[] = [];
            worker.process.stderr!.on("data", data => errBuffer.push(data));
            const setup:SetupMessage = {
                testName: test.name,
                benchName: this.name,
                cycles: test.cycles,
                warmUpCycles: test.warmUpCycles,
                time: this.options.time,
                warmUpTime: this.options.warmUpTime,
                first: test.samples.length === 0
            };
            send(worker.process.stdio[3]! as STREAM.Writable, setup);
            worker.on("exit", (code) => {
                let err = `Process ended prematurely. Exit code: ${code}`;
                if (errBuffer.length > 0) {
                    err = `${err}. Error: ${Buffer.concat(errBuffer).toString()}`;
                }
                done(err);
            });
        }));
    }
}