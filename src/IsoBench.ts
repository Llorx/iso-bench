import FS from "fs";

import { RunMessage, Test } from "./Test";
import { WorkerSetup, SetupMessage } from "./WorkerSetup";
import { Processor } from "./Processor";
import { ConsoleLog } from "./processors";

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
    tests = new Map<string, Test>();
    options:Required<IsoBenchOptions>;
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
        name = getUniqueName(name, this.tests);
        this.tests.set(name, new Test(name, callback, setup));
        return this;
    }
    addProcessor(processor:Processor) {
        this.processors.push(processor);
        return this;
    }
    consoleLog() {
        return this.addProcessor(new ConsoleLog());
    }
    async run() {
        if (WorkerSetup) {
            // If is a fork, try to run the specific test
            this._start(WorkerSetup);
        } else {
            // If is the master, run all test forks
            let i = 0;
            const tests = Array.from(this.tests.values());
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
                const test = this.tests.get(setup.testName);
                if (!test) {
                    throw new Error("Test '" + setup.testName + "' not found");
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