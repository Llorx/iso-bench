import { STRINGS } from "./STRINGS";

export type SetupMessage = {
    testName:string;
    benchName:string;
    cycles:number;
    warmUpCycles:number;
    time:number;
    warmUpTime:number;
};

export let WorkerSetup:SetupMessage|null = null;
if (process.env[STRINGS.ISO_BENCH_SETUP]) {
    try {
        WorkerSetup = JSON.parse(process.env[STRINGS.ISO_BENCH_SETUP]!);
    } catch (e) {
        WorkerSetup = null;
    }
}