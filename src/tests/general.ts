import * as UTIL from "util";
import type * as CRYPTO_T from "crypto";

import { IsoBench, STRINGS } from "..";

const _consoleLog = console.log;
function testLog(log:RegExp, ...logs:RegExp[]) { // Force typings at least 1 argument
    logs.unshift(log);
    console.log = (...args:any[]) => {
        let str = UTIL.formatWithOptions({ colors: false }, new Array(args.length).fill("%s").join(" "), ...args.map(el => el instanceof Buffer ? UTIL.inspect(el) : el));
        let log = logs.shift()!;
        if (!log.test(str)) {
            throw new Error("Invalid log test: " + log + ". Received: " + str);
        } else if (logs.length === 0) {
            console.log = () => {};
        }
    };
}

const SLOW_REGEXP = new RegExp(`^slow.*1\\.000x \\(${STRINGS.WORSE}\\)$`);
const FAST_REGEXP = new RegExp(`^fast.*x \\(${STRINGS.BEST}\\)$`);

function slowfast() {
    _consoleLog("Testing slow-fast result comparison");
    const bench = new IsoBench("My bench", {
        time: 100,
        parallel: 2
    }).add("slow", () => {
        /s/.test("test this");
    }).add("fast", () => {
        "test this".indexOf("s");
    });
    testLog(SLOW_REGEXP, FAST_REGEXP);
    return bench.run();
}
function fastslow() {
    _consoleLog("Testing fast-slow result comparison");
    const bench = new IsoBench("My bench", {
        time: 100,
        parallel: 2
    }).add("fast", () => {
        "test this".indexOf("s");
    }).add("slow", () => {
        /s/.test("test this");
    });
    testLog(FAST_REGEXP, SLOW_REGEXP);
    return bench.run();
}

(async function() {
    await slowfast();
    await fastslow();
    IsoBench.IfMaster(() => _consoleLog("Tests completed"));
})();