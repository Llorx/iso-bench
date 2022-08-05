import FS from "fs";

import dts from "rollup-plugin-dts";
import { terser } from "rollup-plugin-terser";
import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";

try {
    FS.rmSync("./lib", { recursive: true });
} catch (e) {}

export default [{
    input: "./src/index.ts",
    output: [{
        file: __dirname + "/lib/iso-bench.mjs",
        sourcemap: true,
        format: "es"
    }, {
        file: __dirname + "/lib/iso-bench.min.mjs",
        format: "es",
        plugins: [terser()]
    }, {
        file: __dirname + "/lib/iso-bench.js",
        sourcemap: true,
        format: "cjs"
    }, {
        file: __dirname + "/lib/iso-bench.min.js",
        format: "cjs",
        plugins: [terser()]
    }],
    plugins: [
        commonjs(),
        typescript({ tsconfig: "./tsconfig.build.json" })
    ]
}, {
    input: "./src/index.ts",
    output: [{
        file: __dirname + "/lib/iso-bench.browser.js",
        sourcemap: true,
        format: "umd",
        name: "window",
        extend: true,
        plugins: []
    }, {
        file: __dirname + "/lib/iso-bench.browser.min.js",
        format: "umd",
        name: "window",
        extend: true,
        plugins: [terser()]
    }],
    plugins: [
        commonjs(),
        typescript({ tsconfig: "./tsconfig.build.json" })
    ]
}, {
    input: "./src/index.ts",
    output: {
        file: __dirname + "/types/index.d.ts",
        format: "es"
    },
    plugins: [
        dts()
    ]
}]