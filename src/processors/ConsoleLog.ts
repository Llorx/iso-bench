import { Result } from "../Result";
import { Processor } from "../Processor";
import { STRINGS } from "../STRINGS";

export class ConsoleLog implements Processor {
    end(result:Result) {
        const tests = result.getTests();
        if (tests) {
            const padding = Math.max(...tests.map(test => test.name.length));
            for (const test of tests) {
                if (test.error) {
                    test.log = [test.error];
                } else if (test.samples.length > 1) {
                    test.log = [test.name.padEnd(padding, " "), "-", Math.round(test.opMs*1000).toLocaleString(), "op/s.", test.samples.length, "samples in", Math.round(test.totalTime), "ms."];
                } else {
                    test.log = [test.name.padEnd(padding, " "), "-", Math.round(test.opMs*1000).toLocaleString(), "op/s in", Math.round(test.totalTime), "ms."];
                }
            }
            const ops = tests.map(test => test.opMs);
            const min = Math.min(...ops.filter(n => !!n));
            const max = Math.max(...ops.filter(n => !!n));
            for (const test of tests) {
                if (test.opMs > 0) {
                    test.log.push(`${(test.opMs / min).toFixed(3)}x`);
                    test.log.push(`${test.opMs === min ? `(${STRINGS.WORSE})` : ""}${test.opMs === max ? `(${STRINGS.BEST})` : ""}`);
                }
                console.log(...test.log);
            }
            console.log(STRINGS.COMPLETED);
        }
    }
}