import { IsoBenchOptions, Processor } from ".";
import { SetupMessage } from "./WorkerSetup";
import { Messager } from "./Messager";
import { getDiff } from "./getDiff";
import { ForkContext } from "./ForkContext";

export type Sample = {
    cycles: number;
    time:number;
    ops:number;
};

export class Test {
    error:string|null = null;
    opMs = 0;
    totalTime = 0;
    samples:Sample[] = [];
    group = "";
    constructor(readonly name:string, readonly index:number, private _callback:(setupData?:unknown)=>void, private _setup?:()=>unknown) {}
    fork(benchName:string, processors:Processor[], options:Required<IsoBenchOptions>) {
        return new Promise<void>((resolve => {
            // Start new context for this specific fork run
            const forkContext = new ForkContext(this, processors, resolve, benchName, options);
            forkContext.start();
        }));
    }
    async run(setup:SetupMessage) {
        getDiff(1, this._callback, this._setup); // warmup
        let cycles = 1;
        let samples = setup.samples;
        while(samples > 0) {
            const diff = getDiff(cycles, this._callback, this._setup);
            if (diff >= setup.time) {
                samples--;
                await Messager.send({
                    diff: diff,
                    cycles: cycles
                });
            }
            const ratio = diff > 0 ? (setup.time / diff) * 1.02 : 1.1; // Go a 2% further, to avoid it ending just below the targetTime. Increase by 10% if zero is received (mostly in systems without nanosecond resolution)
            cycles = diff >= setup.time ? Math.round(cycles * ratio) : Math.ceil(cycles * ratio);
        }
    }
}