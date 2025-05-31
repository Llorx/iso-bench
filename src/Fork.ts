import { spawn } from "child_process";

export namespace Fork {
    export function fork(env:Record<string, string>) {
        return spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                ...env
            }
        });
    }
}