import STREAM from "stream";

import { Test, TestOptions } from "./Test";
import { Messager, RunMessage } from "./Messager";
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
} & TestOptions;
export class IsoBench {
    processors:Processor[] = [];
    tests:Test[] = [];
    currentTests:Test[] = [];
    options:Required<IsoBenchOptions>;
    running = false;
    constructor(readonly name:string = "IsoBench", options?:IsoBenchOptions) {
        this.options = {...{ // Set defaults
            parallel: 1,
            samplesPerSpawn: 5,
            spawns: 10,
            customCycles: null,
            time: 100
        }, ...options};
        this.name = getUniqueName(this.name, BENCHES);
        BENCHES.set(this.name, this);
    }
    static IfMaster(cb:()=>void) {
        if (!WorkerSetup) {
            cb();
        }
    }
    add(name:string, callback:()=>void, options?:TestOptions):this;
    add<T>(name:string, callback:(setup:T)=>void, setup:()=>T, options?:TestOptions):this;
    add(name:string, callback:(setup?:any)=>void, setup?:(()=>any)|null|TestOptions, options?:TestOptions) {
        if (this.running) {
            throw new Error("Can't add tests to a running bench");
        }
        if (setup && typeof setup === "object") {
            options = setup;
            setup = null;
        }
        const filteredTestOptions = options && Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined));
        const test = new Test(name, this.tests.length, {
            ...this.options,
            ...filteredTestOptions
        }, {
            callback: callback,
            setup: typeof setup === "function" ? setup : null
        });
        this.tests.push(test);
        this.currentTests.push(test);
        return this;
    }
    addProcessor(processorCallback:() => Processor) {
        if (WorkerSetup) {
            return this;
        }
        if (this.running) {
            throw new Error("Can't add processors to a running bench");
        }
        this.processors.push(processorCallback());
        return this;
    }
    consoleLog() {
        if (WorkerSetup) {
            return this;
        }
        return this.addProcessor(() => new ConsoleLog());
    }
    streamLog(streamCallback:() => STREAM.Writable) {
        if (WorkerSetup) {
            return this;
        }
        return this.addProcessor(() => new StreamLog(streamCallback()));
    }
    endGroup(name:string) {
        for (const test of this.currentTests.splice(0)) {
            test.setGroup(name);
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
    private async _start(setup:SetupMessage) {
        if (this.name === setup.benchName) { // Wait for the specific test this fork should run
            try {
                const test = this.tests[setup.testIndex];
                if (!test) {
                    throw new Error("Test index " + setup.testIndex + " not found");
                }
                await test.run();
                await Messager.send({
                    done: true
                });
            } catch (e) {
                await Messager.send({
                    error: String(e)
                });
            }
            process.exit();
        }
    }
}