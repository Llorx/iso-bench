export type SetupMessage = {
    testI:number;
    benchName:string;
    cycles:number;
    warmUpCycles:number;
    time:number;
    warmUpTime:number;
};

export let WorkerSetup:SetupMessage|null = null;
if (process.env["ISO_BENCH_SETUP"]) {
    try {
        WorkerSetup = JSON.parse(process.env["ISO_BENCH_SETUP"]!);
    } catch (e) {
        WorkerSetup = null;
    }
}