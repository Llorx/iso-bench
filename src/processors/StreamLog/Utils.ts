import { Test, Sample } from "../../Test";
import { TestOutput } from "./DynamicStream";

export type Group = {
    name:string;
    tests:Test[];
    started:number;
    ended:number;
    output?:TestOutput;
};

export const enum COLORS {
    CLEAR = "\x1b[0m",
    GRAY = "\x1b[30m",
    RED = "\x1b[31m",
    GREEN = "\x1b[32m",
    YELLOW = "\x1b[33m",
    BLUE = "\x1b[36m"
}
export function formatColor(str:string, color:COLORS, useColor:boolean) {
    return useColor ? `${color}${str}${COLORS.CLEAR}` : str;
}
export function getTestLog(padding:number, test:Test, minMax:{min:number, max:number}|null, useColor:boolean, sample?:Sample) {
    const logArgs:unknown[] = [test.name.padEnd(padding, " "), "-"];
    if (test.error) {
        logArgs.push(formatColor(test.error, COLORS.RED, useColor));
    } else {
        logArgs.push(formatColor(Math.round((sample ? sample.ops : test.opMs) *1000).toLocaleString(), COLORS.BLUE, useColor));
        if (!sample && test.samples.length > 1) {
            logArgs.push("op/s.", formatColor(String(test.samples.length), COLORS.BLUE, useColor), "samples in");
        } else {
            logArgs.push("op/s in");
        }
        logArgs.push(formatColor(String(Math.round(sample ? sample.time : test.totalTime)), COLORS.BLUE, useColor), "ms.");
        if (minMax) {
            logArgs.push(formatColor(`${(test.opMs / minMax.min).toFixed(3)}x`, COLORS.BLUE, useColor));
            if (test.opMs === minMax.min) {
                logArgs.push(formatColor(`(WORST)`, COLORS.YELLOW, useColor));
            } else if (test.opMs === minMax.max) {
                logArgs.push(formatColor(`(BEST)`, COLORS.GREEN, useColor));
            }
        }
    }
    return logArgs;
}