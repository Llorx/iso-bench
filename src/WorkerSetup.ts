export type SetupMessage = {
    testIndex:number;
    benchName:string;
    time:number;
    samples:number;
};

let WorkerSetup:SetupMessage|null = null;
if (process.env["ISO_BENCH_SETUP"]) {
    try {
        WorkerSetup = JSON.parse(process.env["ISO_BENCH_SETUP"]!);
    } catch (e) {
        WorkerSetup = null;
    }
}
export { WorkerSetup };