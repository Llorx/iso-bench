# iso-bench
`iso-bench` is a small benchmark library focused on avoiding optimization/deoptimization pollution between tests by isolating them.
## Motivation
I've always used `benchmark.js` for my benchmark tests, but I noticed that **changing the tests order also changed the performance outcome**. They were getting _polluted_ between them with V8 and memory optimizations/deoptimizations. After this, I decided to take advantage of forking to do tests in completely separated processes with their own V8 instances, memory and so on, to avoid present and future _optimization/deoptimization pollution_.

All single threaded benchmark libraries, like [benny](https://github.com/caderek/benny) or [benchmark.js](https://github.com/bestiejs/benchmark.js) have this problem, so you may had this pollution on your tests and you didn't even notice, just thinking that one test was faster than the other. This happened to me, and when I noticed the problem I had to redo some [PacoPack](https://github.com/Llorx/pacopack) code ☹️.
## Pollution examples
Running this test on `benchmark.js`, it will return different outcomes. Note how I rerun the same very first test again, but it gives different results. And if you change the order you get different results:
```javascript
const Benchmark = require("benchmark");

const functions = {
    direct: function(buf:Buffer) {
        return buf[0];
    },
    method: function(buf:Buffer) {
        return buf.readUint8(0);
    },
    direct_again: function(buf:Buffer) {
        return buf[0];
    },
    method_again: function(buf:Buffer) {
        return buf.readUint8(0);
    }
};

let buffers = new Array(1000).fill(0).map(() => {
    let buf = Buffer.allocUnsafe(1);
    buf[0] = Math.floor(Math.random() * 0xFF);
    return buf;
});
const suite = new Benchmark.Suite();
for (let [type, fn] of Object.entries(functions)) {
    suite.add(`${type}`, () => {
        for (let i = 0; i < buffers.length; i++) {
            fn(buffers[i]);
        }
    });
}
suite.on("cycle", event => {
    console.log(String(event.target));
}).run({
    async: true
});
```
On iso-bench this is not possible, as every test will run in a completely different process. No matter the order, the outcome will be equally stable.
## Installation
```
npm install iso-bench
```
## Usage
Example code:
```javascript
import { IsoBench } from "iso-bench";

const bench = new IsoBench("My bench");
bench.add("indexOf", () => {
    "thisisastring".indexOf("a") > -1;
})
.add("RegExp", () => {
    /a/.test("thisisastring");
})
.run();
```

## Documentation
```javascript
new IsoBench(name, options?);
```
Creates a new `IsoBench` to add tests.
- `name`: The name of this IsoBench instance. Optional.
- `options`: Object:
    - `parallel`: The amount of parallel tests to run. Although a test may end before its predecessor, the log output will honor the test order. Defaults to **1**.
    - `ms`: The minimum time to invest on each test. The library will automatically increase the amount of cycles to reach a minimum of `minMs` between tests to take samples. Defaults to **1000**.
    - `minMs`: The minimum time to invest on each cycle loop, so the sample is taken into account to calculate the performance. Defaults to **100**.
---
```javascript
bench.add(name, test);
```
Adds new test.
- `name`: The name of this test.
- `test`: The test function to run.
---
```javascript
bench.run();
```
Runs the tests and shows the output in the console. Returns a `Promise` that will resolve when all the tests are completed.