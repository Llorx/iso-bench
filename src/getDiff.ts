import { performance } from "perf_hooks";
import { AsyncSetupCallback, AsyncCallback } from "./IsoBench";

export function getDiff(cycles:number, callback:(setupData?:unknown)=>void, setup?:(()=>unknown)|null) {
    const setupData = setup && setup();
    const startTS = performance.now();
    while(cycles-- > 0) {
        callback(setupData);
    }
    return performance.now() - startTS;
}
function runAsync(cycles:number, callback:AsyncSetupCallback<unknown>, setup:unknown, resolve:()=>void, reject:(error:unknown)=>void) {
    // Duplicated to reduce branching. Important to reduce false timing.
    let sync = true; // detect sync callbacks to avoid max call stacks
    while (cycles-- > 0 && sync) {
        sync = false;
        callback(() => {
            if (sync) {
                runAsync(cycles, callback, setup, resolve, reject);
            } else {
                sync = true;
            }
        }, reject, setup);
    }
    if (sync) {
        resolve();
    } else {
        sync = true;
    }
}
export function getAsyncDiff<T>(cycles:number, callback:AsyncCallback|AsyncSetupCallback<T>, setup?:(()=>T)|null) {
    return new Promise<number>((resolve, reject) => {
        const setupData = setup && setup();
        const startTS = performance.now();
        runAsync(cycles, callback as AsyncSetupCallback<unknown>, setupData, () => {
            resolve(performance.now() - startTS);
        }, reject);
    });
}