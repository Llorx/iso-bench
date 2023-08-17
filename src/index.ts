import cluster, { ClusterSettings } from "cluster";
import FS from "fs";
import type STREAM from "stream";

type SetupMessage = {
    testName:string;
    benchName:string;
    cycles:number;
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
function send(stream:STREAM.Writable, data:any) {
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
        stdio: ["pipe", "pipe", "pipe", "pipe", "pipe", "ipc"]
    };
    if (cluster.setupPrimary) {
        cluster.setupPrimary(options);
    } else {
        cluster.setupMaster(options);
    }
} else {
    writeStream = FS.createWriteStream("", {fd: 3});
    onRead(FS.createReadStream("", {fd: 4}), (message:SetupMessage) => {
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
    ms?:number;
    minMs?:number;
};
const defaultOptions:Required<IsoBenchOptions> = {
    parallel: 1,
    ms: 1000,
    minMs: 100
};

class Test {
    error:string|null = null;
    log:any[] = [];
    cycles = 100;
    totalTime = 0;
    opMs = -1;
    samples = 0;
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
    private _logs:any[][] = [];
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
    static CallMaster(cb:()=>void) {
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
    log(...args:any) {
        this._logs.push(args);
        return this;
    }
    async run() {
        if (isMaster) {
            for (const log of this._logs) {
                console.log(...log);
            }
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
                } else {
                    test.log = [test.name, "-", Math.round(test.opMs*1000).toLocaleString(), "op/s.", test.samples, "samples in", Math.round(test.totalTime), "ms."];
                }
            }
            this._output(tests);
            console.log(STRINGS.COMPLETED);
        } else if (++this._ready === 2) {
            if (setup) {
                this._start(setup);
            }
        }
    }
    private _start(setup:SetupMessage) {
        if (!writeStream) {
            throw new Error("No parent process");
        }
        if (this.name === setup.benchName) {
            for (const log of this._logs) {
                console.log(...log);
            }
            try {
                const test = this.tests.get(setup.testName);
                if (!test) {
                    throw new Error("Test '" + setup.testName + "' not found");
                }
                send(writeStream, {
                    diff: this._runTest(test, setup.cycles)
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
            const done = (error?:string, diff?:number) => {
                if (!ended) {
                    ended = true;
                    if (error) {
                        test.opMs = 0;
                        test.error = error;
                        resolve();
                    } else if (diff) {
                        if (diff < this.options.minMs) {
                            const ratio = this.options.minMs / diff;
                            test.cycles = Math.round(test.cycles * (ratio || this.options.minMs));
                            this._newWorker(test).then(resolve);
                        } else {
                            test.samples++;
                            const ops = test.cycles / diff;
                            test.opMs = test.opMs < 0 ? ops : (test.opMs + ops) / 2;
                            test.totalTime += diff;
                            if (test.totalTime >= this.options.ms) {
                                resolve();
                            } else {
                                this._newWorker(test).then(resolve);
                            }
                        }
                    }
                }
            };
            onRead(worker.process.stdio[3]! as STREAM.Readable, (message:any) => {
                done(message.error, message.diff);
            });
            const setup:SetupMessage = {
                testName: test.name,
                benchName: this.name,
                cycles: test.cycles
            };
            send(worker.process.stdio[4]! as STREAM.Writable, setup);
            worker.on("exit", (code) => {
                done("Process ended prematurely. Exit code: " + code);
            });
        }));
    }
}