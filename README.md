# iso-bench
`iso-bench` is a small benchmark library focused on avoiding optimization/deoptimization pollution between tests by isolating them.

1. [Motivation](#1-motivation)
1. [Pollution examples](#2-pollution-examples)
1. [Installation](#3-installation)
1. [Usage](#4-usage)
1. [Documentation](#5-documentation)
   1. [Processor](#i-processor)

## 1. Motivation
I've always used `benchmark.js` for my benchmark tests, but I noticed that **changing the tests order also changed the performance outcome**. They were getting _polluted_ between them somehow. V8 optimizations/deoptimizations maybe? I decided to take advantage of forking to do tests in completely separated processes with their own V8 instances, memory and so on, to avoid present and future _optimization/deoptimization pollution_.

All single threaded benchmark libraries, like [benny](https://github.com/caderek/benny) or [benchmark.js](https://github.com/bestiejs/benchmark.js) suffer this problem, so you may had this pollution on your tests and you didn't even notice, just thinking that one test was faster than the other. This happened to me, and when I noticed the problem it was too late and I had to refactor some [PacoPack](https://github.com/Llorx/pacopack) code ☹️

## 2. Pollution examples
Running this test on `benchmark.js` will return different outcomes. Note how `method` and `method_again` run the very same exact code:
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
method_again x 187,985 ops/sec // SLOWER THAN "method"?? IS THE SAME CODE!!
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
bench.consoleLog().run();
```
Which yields these results with zero pollution:
```typescript
method       - 1.714.953 op/s.
direct       - 1.712.045 op/s.
method_again - 1.699.022 op/s.
```

## 3. Installation
```
npm install iso-bench
```

## 4. Usage
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
.consoleLog()
.run();
```

## 5. Documentation
```typescript
new IsoBench(name?:string, options?:IsoBenchOptions);
```
Creates a new `IsoBench` instance to benchmark your code.
- `name`: The name of this IsoBench instance. Defaults to `IsoBench`.
- `options`: Object:
    - `parallel`: The amount of parallel tests to run. Defaults to **1**.
    - `time`: The minimum time (in milliseconds) to invest on each test. The library will automatically increase the amount of cycles to reach a minimum of `ms` between tests to take samples. Note that the setup callback is called one time per *cycle set*, so it will be reused on each cycle, so if the setup is consumable you must use `customCycles` instead. Defaults to **100**.
    - `customCycles`: If you have your own amount of cycles (for, while, iterator, anything), you can input the amount of cycles that you are running. The library will divide the resuting time with this `customCycles` to calculate the amount of operations per second for this sample. Make sure that a proper amount of time is spent on each iteration (50-100ms recommended). This allows to use consumable setups, so the library doesn't run multiple cycles over them (read `time` help). Defaults to **null**.
    - `spawns`: Amount of processes to spawn per test. They will be spawned linearly for the same test, never in parallel. Defaults to **10**.
    - `samplesPerSpawn`: Amount of samples to run on each spawned process. Defaults to **5**.

---
```typescript
bench.add<T>(name:string, test:(setupReturn:T)=>void, setup?:()=>T, testOptions?:TestOptions):this;
```
Adds new test.
- `name`: The name of this test.
- `test`: The test function to run.
Returns the IsoBench instance, to concatenate new tests easily.
- `setup`: Optional. The setup function to run before the test. If you are very concerned about the pollution between tests when preparing data that only one test needs, you can use the `setup` callback to return the data that will be provided to the `test` callback as the first argument. The other tests will not run this `setup` callback in their isolated processes.
- `testOptions`: Same options as `IsoBenchOptions` but omitting `parallel`. These will apply to this specific test, merging with the general `IsoBenchOptions` that you've passed.

Example:
```typescript
bench.add("object.result", (obj) => {
  // Test callback receiving the obj from the setup callback
  object.result = object.result + 1;
}, () => {
  // Setup callback
  let objResult = 0;
  return Object.defineProperties({}, {
      result: {
        get: () => objResult,
        set: (res) => objResult = res
      }
  });
});

bench.add("for of generator", (obj) => {
  let res = 0;
  for(const value of iterable) {
    res = res ^ value;
  }
}, () => {
  // Create a consumable setup element
  let count = 1000000;
  function* createIterable() {
    for (let i = 0; i < count; i++) {
      yield i;
    }
  }
  return createIterable();
}, {
  // The library first cycle will consume it so next cycles will return invalid results,
  // so we tell the library that we have a custom cycle system with the amount of cycles
  customCycles: 1000000
});
```

---
```typescript
bench.addAsync<T>(name:string, test:(resolve:()=>void, reject:()=>void, setupReturn:T)=>void, setup:()=>T, testOptions?:TestOptions):this;
```
Adds a new async test. `resolve` or `reject` should be called when the test finishes, like a `Promise` callback. It uses callbacks instead of actual promises to reduce amount of internal overhead and keep timings as close to the original.
 - Same options as `bench.add`.

Example:
```typescript
bench.addAsync("get async data", async (resolve, reject) => {
  try {
    await loadData();
  } catch (e) {
    reject(e);
  }
  resolve();
});

bench.addAsync("process async data", async (resolve, reject, data) => {
  try {
    await processData(data);
  } catch (e) {
    reject(e);
  }
  resolve();
}, () => {
  // Setup callback
  let objResult = 0;
  return Object.defineProperties({}, {
      result: {
        get: () => objResult,
        set: (res) => objResult = res
      }
  });
});
```

---
```typescript
bench.endGroup(name:string):this;
```
Group the tests added up to this point. The result comparator will be done only between tests in the same group. Example:
```typescript
import { IsoBench } from "iso-bench";

const bench = new IsoBench("My bench");
bench.add("indexOf", () => {
    "thisisastring".indexOf("a") > -1;
})
.add("RegExp", () => {
    /a/.test("thisisastring");
})
.endGroup("small string") // First group
.add("indexOf", () => {
    "thisisastring thisisastring".indexOf("a") > -1;
})
.add("RegExp", () => {
    /a/.test("thisisastring thisisastring");
})
.endGroup("big string") // Second group
.consoleLog()
.run();
```

---
```typescript
bench.consoleLog():this;
```
Adds a built-in [Processor](#i-processor) that outputs the result in the console. Returns the IsoBench instance.

---
```typescript
bench.streamLog(streamCallback:() => Stream.Writable):this;
```
Adds a built-in [Processor](#i-processor) that outputs the result in a writable stream, like a file or a socket. The writable stream should be returned inside the callback function so it will be only called in the main process. Returns the IsoBench instance.

---
```typescript
bench.addProcessor(processorCallback:() => Processor):this;
```
Adds a custom [Processor](#i-processor) that must implement the [Processor](#i-processor) interface. The callback should return a [Processor](#i-processor) instance so it will be only called in the main process. Returns the IsoBench instance.

---
```typescript
bench.run():Promise<void>;
```
Start running the tests. Returns a `Promise` that will resolve when all the tests are completed.

### i. Processor
Processors will receive the benchmark events to process them. They must implement the Processor interface:
```typescript
export interface Processor {
    initialize?(bench:IsoBench, tests:Test[]):void;
    start?(test:Test):void;
    sample?(test:Test, sample:Sample):void;
    end?(test:Test):void;
    completed?(tests:Tests[]):void;
}
```

Processor methods:
```typescript
initialize(bench:IsoBench, tests:Test[]):void;
```
Will be called when the benchmark starts. Receives the IsoBench instance and a test array of the tests that are going to be run, for initialization purposes. Optional.

---
```typescript
start(test:Test):void;
```
Will be called when a Test starts to run. Optional.

---
```typescript
sample(test:Test, sample:Sample):void;
```
Will be called when a new Sample is added to a Test. Optional.

---
```typescript
end(test:Test):void;
```
Will be called when a Test has collected enough samples and can calculate the final result, or when a test fails (check for the `test.error` property). Optional.

---
```typescript
completed(tests:Tests[]):void;
```
Will be called when the benchmark is completed. Receives an array with all the tests (including the errored ones). Optional.

---
Custom Processor example:
```typescript
import { Processor, Test } from "iso-bench";
class MyProcessor implements Processor {
    end(test:Test) {
        console.log(test);
    }
    completed(tests:Tests[]) {
        console.log(tests);
    }
}
```