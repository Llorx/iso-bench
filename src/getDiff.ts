import { performance } from "perf_hooks";

export function getDiff(cycles:number, callback:(setupData?:unknown)=>void, setup?:()=>unknown) {
    const setupData = setup && setup();
    const startTS = performance.now();
    while(cycles-- > 0) {
        callback(setupData);
    }
    return performance.now() - startTS;
}