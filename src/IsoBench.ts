import FS from "fs";
import STREAM from "stream";

import { RunMessage, Test } from "./Test";
import { WorkerSetup, SetupMessage } from "./WorkerSetup";
import { Processor } from "./Processor";
import { ConsoleLog, StreamLog } from "./processors";

let IDs = 0;
function getUniqueName(name:string, map:Map<string, unknown>) {
    let newName = name;
    while (map.has(newName)) {
        newName = `${name}_${IDs++}`;
    }
    return newName;
}

const BENCHES = new Map<string, IsoBench>();
export type IsoBenchOptions = {
    parallel?:number;
    samples?:number;
    time?:number;
    warmUpTime?:number;
};
export class IsoBench {
    processors:Processor[] = [];
    tests:Test[] = [];
    currentTests:Test[] = [];
    options:Required<IsoBenchOptions>;
    running = false;
    constructor(readonly name:string = "IsoBench", options?:IsoBenchOptions) {
        this.options = {...{ // Set defaults
            parallel: 1,
            samples: 1,
            time: 3000,
            warmUpTime: 500
        }, ...options};
        this.name = getUniqueName(this.name, BENCHES);
        BENCHES.set(this.name, this);
    }
    static IfMaster(cb:()=>void) {
        if (!WorkerSetup) {
            cb();
        }
    }
    add(name:string, callback:()=>void):this;
    add<T>(name:string, callback:(setup:T)=>void, setup:()=>T):this;
    add(name:string, callback:(setup?:any)=>void, setup?:()=>any) {
        if (this.running) {
            throw new Error("Can't add tests to a running bench");
        }
        const test = new Test(name, this.tests.length, callback, setup);
        this.tests.push(test);
        this.currentTests.push(test);
        return this;
    }
    addProcessor(processor:Processor) {
        if (WorkerSetup) {
            return this;
        }
        if (this.running) {
            throw new Error("Can't add processors to a running bench");
        }
        this.processors.push(processor);
        return this;
    }
    consoleLog() {
        if (WorkerSetup) {
            return this;
        }
        return this.addProcessor(new ConsoleLog());
    }
    streamLog(stream:STREAM.Writable) {
        if (WorkerSetup) {
            return this;
        }
        return this.addProcessor(new StreamLog(stream));
    }
    endGroup(name:string) {
        for (const test of this.currentTests.splice(0)) {
            test.group = name;
        }
        return this;
    }
    async run() {
        if (this.running) {
            throw new Error("Already running");
        }
        this.running = true;
        this.endGroup("");
        if (WorkerSetup) {
            // If is a fork, try to run the specific test
            this._start(WorkerSetup);
        } else {
            // If is the master, run all test forks
            if (this.processors.length === 0) {
                // Show output to console if no processor is added
                this.consoleLog();
            }
            let i = 0;
            const tests = this.tests.slice();
            for (const processor of this.processors) {
                processor.initialize && processor.initialize(this, tests);
            }
            await Promise.all(new Array(this.options.parallel).fill(0).map(async () => {
                while (i < tests.length) {
                    const test = tests[i++];
                    for (const processor of this.processors) {
                        processor.start && processor.start(test);
                    }
                    await test.fork(this.name, this.processors, this.options);
                    for (const processor of this.processors) {
                        processor.end && processor.end(test);
                    }
                }
            }));
            for (const processor of this.processors) {
                processor.completed && processor.completed(tests);
            }
        }
    }
    private _start(setup:SetupMessage) {
        if (this.name === setup.benchName) { // Wait for the specific test this fork should run
            let sendData:RunMessage;
            try {
                const test = this.tests[setup.testI];
                if (!test) {
                    throw new Error("Test index " + setup.testI + " not found");
                }
                sendData = test.run(setup);
            } catch (e) {
                sendData = {
                    error: String(e)
                };
            }
            const bufferLength = Buffer.allocUnsafe(2);
            const buffer = Buffer.from(JSON.stringify(sendData));
            bufferLength.writeUint16LE(buffer.length);
            FS.createWriteStream("", {fd: 3}).write(Buffer.concat([bufferLength, buffer]), () => process.exit());
        }
    }
}