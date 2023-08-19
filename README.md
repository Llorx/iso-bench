# iso-bench
`iso-bench` is a small benchmark library focused on avoiding optimization/deoptimization pollution between tests by isolating them.
## Motivation
I've always used `benchmark.js` for my benchmark tests, but I noticed that **changing the tests order also changed the performance outcome**. They were getting _polluted_ between them with V8 and memory optimizations/deoptimizations. After this, I decided to take advantage of forking to do tests in completely separated processes with their own V8 instances, memory and so on, to avoid present and future _optimization/deoptimization pollution_.

All single threaded benchmark libraries, like [benny](https://github.com/caderek/benny) or [benchmark.js](https://github.com/bestiejs/benchmark.js) have this problem, so you may had this pollution on your tests and you didn't even notice, just thinking that one test was faster than the other. This happened to me, and when I noticed the problem I had to redo some [PacoPack](https://github.com/Llorx/pacopack) code ☹️.
## Pollution examples
Running this test on `benchmark.js`, it will return different outcomes. Note how I rerun the very same first test again:
```typescript
const Benchmark = require("benchmark");
const functions = {
    method: function(buf:Buffer) {
        return buf.readUint8(0);
    },
    direct: function(buf:Buffer) {
        return buf[0];
    },
    method_again: function(buf:Buffer) {
        return buf.readUint8(0);
    }
};
const buffers = new Array(1000).fill(0).map(() => {
    const buf = Buffer.allocUnsafe(1);
    buf[0] = Math.floor(Math.random() * 0xFF);
    return buf;
});
const suite = new Benchmark.Suite();
for (const [type, fn] of Object.entries(functions)) {
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
Which yields the next results:
```typescript
method       x 314,830 ops/sec
direct       x 300,522 ops/sec
method_again x 187,985 ops/sec // SLOWER THAN "method" WHICH IS THE SAME ONE??
```
And if I run the `direct` test first, it is even worse:
```typescript
direct       x 1,601,246 ops/sec // 5 TIMES FASTER THAN BEFORE??
method       x 183,015 ops/sec // This test already got deoptimized
method_again x 183,956 ops/sec
```
On iso-bench this is not possible, as every test will run in a completely different process. No matter the order, the outcome will be equally stable. This is the very same test on iso-bench:
```typescript
import { IsoBench } from "..";
const bench = new IsoBench();
const functions = {
  method: function(buf:Buffer) {
      return buf.readUint8(0);
  },
  direct: function(buf:Buffer) {
      return buf[0];
  },
  method_again: function(buf:Buffer) {
      return buf.readUint8(0);
  }
};
const buffers = new Array(1000).fill(0).map(() => {
  const buf = Buffer.allocUnsafe(1);
  buf[0] = Math.floor(Math.random() * 0xFF);
  return buf;
});
for (const [type, fn] of Object.entries(functions)) {
  bench.add(`${type}`, () => {
      for (let i = 0; i < buffers.length; i++) {
          fn(buffers[i]);
      }
  });
}
bench.run().then(result => result.console.log());
```
Which yields these results with zero pollution:
```typescript
method       - 1.714.953 op/s in 3140 ms. 1.009x (BEST)
direct       - 1.712.045 op/s in 3032 ms. 1.008x
method_again - 1.699.022 op/s in 3128 ms. 1.000x (WORSE)
```
## Installation
```
npm install iso-bench
```
## Usage
Example code:
```typescript
import { IsoBench } from "iso-bench";

const bench = new IsoBench("My bench");
bench.add("indexOf", () => {
    "thisisastring".indexOf("a") > -1;
})
.add("RegExp", () => {
    /a/.test("thisisastring");
})
.run().then(result => result.console.log());
```

## Documentation
```typescript
new IsoBench(name, options?);
```
Creates a new `IsoBench` to add tests.
- `name`: The name of this IsoBench instance. Optional.
- `options`: Object:
    - `parallel`: The amount of parallel tests to run. Defaults to **1**.
    - `time`: The minimum time (in milliseconds) to invest on each test. The library will automatically increase the amount of cycles to reach a minimum of `ms` between tests to take samples. Defaults to **3000**.
    - `samples`: Amount of samples to get. Defaults to **1**.
    - `warmUpTime`: The minimum time (in milliseconds) to pre-run the tests, so the JavaScript engine optimizer (TurboFan in V8) kicks-in before initializing the timer. Defaults to **500**.
---
```typescript
bench.add(name, test):this;
```
Adds new test.
- `name`: The name of this test.
- `test`: The test function to run.
Returns the IsoBench instance, to concatenate new tests easily.
---
```typescript
bench.run():Promise<Result>;
```
Runs the tests and returns a `Promise` that will resolve when all the tests are completed. It will return a `Result` instance.
### Result
This is the result of the benchmark. It will contain a list of the tests executed. Note that inside the forked processes, this result will not contain any test, as the main process should be the only one processing the results.
---
```typescript
result.console.log();
```
Shows the result log in the console.
---
```typescript
result.getTests():Test[]|null;
```
Returns an array of test results in the main process or `null` in a child process. Always check for `null` and do nothing if it is `null`. Only the master process should work with the result.