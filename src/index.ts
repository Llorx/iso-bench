import FS from "fs";

import { Test } from "./Test";
import { WorkerSetup, SetupMessage } from "./WorkerSetup";
import { STRINGS } from "./STRINGS";
import { Result } from "./Result";

let IDs = 0;
function getUniqueName(name:string, map:Map<string, any>) {
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
    add(name:string, callback:()=>void) {
        name = getUniqueName(name, this.tests);
        this.tests.set(name, new Test(name, callback));
        return this;
    }
    async run() {
        if (WorkerSetup) {
            // If is a fork, try to run the specific test
            this._start(WorkerSetup);
        } else {
            // If is the master, run all test forks
            const tests = this._nextTest();
            await Promise.all(new Array(this.options.parallel).fill(0).map(async () => {
                for (const test of tests) {
                    await test.fork(this.name, this.options);
                }
            }));
        }
        return new Result(WorkerSetup ? null : Array.from(this.tests.values()));
    }
    private _start(setup:SetupMessage) {
        if (this.name === setup.benchName) { // Wait for the specific test this fork should run
            let sendData:any = null;
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
    private* _nextTest() {
        const tests = Array.from(this.tests.values());
        while (tests.length > 0) {
            yield tests.shift()!;
        }
        return null;
    }
}