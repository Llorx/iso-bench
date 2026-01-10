import { AsyncCallback, AsyncSetupCallback, IsoBenchOptions, Processor } from ".";
import { Messager } from "./Messager";
import { getAsyncDiff, getDiff } from "./getDiff";
import { ForkContext } from "./ForkContext";

export type Sample = {
    cycles:number;
    time:number;
    ops:number;
};

export type TestOptions = {
    samplesPerSpawn?:number;
    spawns?:number;
} & ({
    customCycles:number;
} | {
    customCycles?:null;
    time?:number;
});
export type TestCallbackSetup<T> = {
    async:false;
    callback:(setupData:T)=>void;
    setup?:(()=>T)|null;
} | {
    async:true;
    callback:AsyncCallback|AsyncSetupCallback<T>;
    setup?:(()=>T)|null;
};
export class Test {
    error:string|null = null;
    opMs = 0;
    totalTime = 0;
    samples:Sample[] = [];
    group = "";
    constructor(readonly name:string, readonly index:number, readonly options:Required<TestOptions>, private _cb:TestCallbackSetup<unknown>) {}
    fork(benchName:string, processors:Processor[], options:Required<IsoBenchOptions>) {
        return new Promise<void>((resolve => {
            const forkContext = new ForkContext(this, processors, resolve, benchName);
            forkContext.start();
        }));
    }
    setGroup(name:string) {
        this.group = name;
    }
    async run() {
        // warmup
        if (this._cb.async) {
            await getAsyncDiff(1, this._cb.callback, this._cb.setup);
        } else {
            getDiff(1, this._cb.callback, this._cb.setup);
        }
        let cycles = 1;
        let samples = this.options.samplesPerSpawn;
        do {
            let diff;
            if (this._cb.async) {
                diff = await getAsyncDiff(cycles, this._cb.callback, this._cb.setup);
            } else {
                diff = getDiff(cycles, this._cb.callback, this._cb.setup);
            }
            if (this.options.customCycles != null || diff >= this.options.time) {
                samples--;
                await Messager.send({
                    diff: diff,
                    cycles: this.options.customCycles != null ? this.options.customCycles : cycles
                });
            }
            if (this.options.customCycles == null) {
                const ratio = diff > 0 ? (this.options.time / diff) * 1.02 : 1.1; // Go a 2% further, to avoid it ending just below the targetTime. Increase by 10% if zero is received (mostly in systems without nanosecond resolution)
                cycles = diff >= this.options.time ? Math.round(cycles * ratio) : Math.ceil(cycles * ratio);
            }
        } while (samples > 0);
    }
}