import * as UTIL from "util";
import type * as CRYPTO_T from "crypto";

import { IsoBench } from "../";

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

const SLOW_REGEXP = new RegExp(`^slow.*1\\.000x \\(${IsoBench.STRINGS.WORSE}\\)$`);
const FAST_REGEXP = new RegExp(`^fast.*x \\(${IsoBench.STRINGS.BEST}\\)$`);

function testArguments() {
    _consoleLog("Testing arguments");
    let buffer = Buffer.allocUnsafe(10);
    buffer.fill(10);
    let scope = new IsoBench.Scope({
        ms: 10
    }, (buffer) => {
        return ["test", 123, function() {}, buffer] as const;
    }, buffer);
    scope.add("args", (arg1, arg2, fn, buffer) => {
        console.log(arg1, arg2, fn.toString(), buffer, buffer.constructor.name);
    });
    testLog(/^test 123 function \(\) { } <Buffer 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a> Buffer$/);
    return scope.run();
}
function testAsyncArguments() {
    _consoleLog("Testing async arguments");
    let buffer = Buffer.allocUnsafe(10);
    buffer.fill(10);
    let scope = new IsoBench.Scope({
        ms: 10
    }, async (buffer) => {
        return ["test", 123, function() {}, buffer] as const;
    }, buffer);
    scope.add("args", (arg1, arg2, fn, buffer) => {
        console.log(arg1, arg2, fn.toString(), buffer, buffer.constructor.name);
    });
    testLog(/^test 123 function \(\) { } <Buffer 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a> Buffer$/);
    return scope.run();
}
function slowfast() {
    _consoleLog("Testing slow-fast result comparison");
    let scope = new IsoBench.Scope({
        ms: 100,
        parallel: 2
    });
    scope.add("slow", () => {
        /s/.test("test this");
    }).add("fast", () => {
        "test this".indexOf("s");
    }).result();
    testLog(SLOW_REGEXP, FAST_REGEXP);
    return scope.run();
}
function fastslow() {
    _consoleLog("Testing fast-slow result comparison");
    let scope = new IsoBench.Scope({
        ms: 100,
        parallel: 2
    });
    scope.add("fast", () => {
        "test this".indexOf("s");
    }).add("slow", () => {
        /s/.test("test this");
    }).result();
    testLog(FAST_REGEXP, SLOW_REGEXP);
    return scope.run();
}
function singleOutputs() {
    _consoleLog("Testing single outputs and result");
    let scope = new IsoBench.Scope({
        ms: 100
    });
    scope.add("slow", () => {
        /s/.test("test this");
    }).output().add("fast", () => {
        "test this".indexOf("s");
    }).output().result();
    testLog(/^slow.*ms\.$/, /^fast.*ms\.$/, SLOW_REGEXP, FAST_REGEXP);
    return scope.run();
}
function doubleoutput() {
    _consoleLog("Testing 2x output and result");
    let scope = new IsoBench.Scope({
        ms: 100
    });
    scope.add("slow", () => {
        /s/.test("test this");
    }).add("fast", () => {
        "test this".indexOf("s");
    }).output().result();
    testLog(/^slow.*ms\.$/, /^fast.*ms\.$/, SLOW_REGEXP, FAST_REGEXP);
    return scope.run();
}
function librarytest() {
    _consoleLog("Testing require test");
    let scope = new IsoBench.Scope({
        ms: 100
    }, () => {
        const CRYPTO = require("crypto") as typeof CRYPTO_T;
        return [CRYPTO] as const;
    });
    scope.add("md5", (CRYPTO) => {
        CRYPTO.createHash("md5").update("test").digest("hex");
    }).output().result();
    testLog(/^md5.*ms\.$/);
    return scope.run();
}

(async function() {
    /*await testArguments();
    await testAsyncArguments();
    await slowfast();
    await fastslow();
    await singleOutputs();
    await doubleoutput();*/
    await librarytest();
    _consoleLog("Tests completed");
})();

