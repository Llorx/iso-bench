# iso-bench
`iso-bench` is a small benchmark library focused on avoiding optimization/deoptimization pollution between tests by isolating them.
## Motivation
I've always used `benchmark.js` for my benchmark tests, but I noticed that **changing the tests order also changed the performance outcome**. They were getting _polluted_ between them somehow (deoptiomizations and such). After this, I decided to take advantage of forking to do tests in completely separated processes with their own V8 instances, memory and so on, to avoid present and future _optimization/deoptimization pollution_.

All single threaded benchmark libraries have this problem, so you may had this pollution on your tests and you didn't even notice, just thinking that one test was faster than the other. This happened to me, and when I noticed the problem I had to redo some [Pac-o-Pack](https://github.com/Llorx/pacopack) code ☹️.
## Pollution examples
Running this test on `benchmark.js` (or similar, like `benny`) will return different outcomes. Note how I rerun the same very first test again, but it gives different results. And if you change the order, always the first test runs faster:
```javascript
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
And so with this test. Note how both objects have the very exact same definition, but still the second test runs way slower:
```javascript
const Benchmark = require("benchmark");

let obj1result = 0;
const obj1 = Object.defineProperties({}, {
    result: {
        get: () => obj1result,
        set: (res) => obj1result = res
    }
});
let obj2result = 0;
const obj2 = Object.defineProperties({}, {
    result: {
        get: () => obj2result,
        set: (res) => obj2result = res
    }
});

new Benchmark.Suite().add("obj1", () => {
    obj1.result = obj1.result + 1;
}).add("obj2", () => {
    obj2.result = obj2.result + 1;
}).on("cycle", function(event) {
    console.log(String(event.target));
}).run({ async: true });
```
On iso-bench this is not possible, as every test will run in a completely different process.
## Installation
```
npm install iso-bench
```
## Usage
Because iso-bench runs on separated processes, the test code does not run on the very same scope as the main thread, so a bit of preparation is needed if you want to access the global scope.

You first need to create a `Scope` where you define all the variables, objects and whatever you are going to use during the test. If you are not going to use extra flavour, just create an empty `Scope`:
```javascript
import { IsoBench } from "iso-bench";

let scope = new IsoBench.Scope();
```
After that, just add tests to the scope and run them showing the final result:
```javascript
scope.add("indexOf", () => {
    "thisisastring".indexOf("a") > -1;
})
.add("RegExp", () => {
    /a/.test("thisisastring");
})
.result()
.run();
```
Also you may want to show the output of the tests as they are being executed, so:
```javascript
scope.add("indexOf", () => {
    "thisisastring".indexOf("a") > -1;
})
.output()
.add("RegExp", () => {
    /a/.test("thisisastring");
})
.output()
.result("# Result:")
.run();
```
If you are reading carefully, surely you'll noticed a small problem with these tests. The `RegExp` one is creating a new `RegExp` object on each run, reducing the performance. To fix this we need to create the `RegExp` object previously. Because the test runs on a separate process, it can't access the main thread scope, so you need to define the variables inside the `Scope` and return them as an array:
```javascript
import { IsoBench } from "iso-bench";

let scope = new IsoBench.Scope({}, () => {
    let regexp = /a/;
    return [regexp];
});
```
and now you are going to receive the scoped variables as function arguments in your tests:
```javascript
scope.add("indexOf", () => {
    "thisisastring".indexOf("a") > -1;
})
.add("RegExp", (regexp) => {
    regexp.test("thisisastring");
})
.result()
.run();
```
### Access main thread scope
To use variables and/or objects from the main thread in the new process, you have to send them to the `Scope` as arguments. Note the "send" word. They are duplicated and recreated, not passed by reference, so only elements allowed by [v8.serialize()](https://nodejs.org/api/v8.html) are allowed here:
```javascript
import { IsoBench } from "iso-bench";

// Array with the same random numbers for both tests
let randomValues = new Array(1000).fill(0).map(() => Math.floor(Math.random()*10));

let scope = new IsoBench.Scope({}, (randomValues) => {
    return [randomValues];
}, randomValues);

scope.add("concat", (randomValues) => {
    let res = "";
    for (let i = 0; i < randomValues.length; i++) {
        res += randomValues[i];
    }
})
.add("join", (randomValues) => {
    randomValues.join("");
})
.result("First part done")
.log("Another test")
.add("reduce", (randomValues) => {
    randomValues.reduce((res, c) => res + c, "");
})
.add("join", (randomValues) => {
    randomValues.join("");
})
.result("Last part done")
.run();
```
In the end, you can threat the `Scope` as a setup script that is executed before each run where you can encapsulate your setup logic.

### Libraries
To use libraries, you need to `require/import` them inside the `Scope` logic. Because the logic runs in a separated process, the folder of reference to require the libraries is the main process working directory. You can modify it with the `__dirname` option.
```javascript
import { IsoBench } from "iso-bench";

let scope = new IsoBench.Scope({
    __dirname: __dirname // NodeJS will use this folder as a reference when looking for absolute or relative libraries.
}, () => {
    const { PacoPack } = require("pacopack"); 
    const { MyClass } = require("../MyClass"); 
    return [new PacoPack(), new MyClass()];
}, randomValues);
```

## Documentation
```javascript
new IsoBench.Scope(options?, setup?, ...args?);
```
Creates a new `Scope` to add tests.
- `options`: Object:
    - `__dirname`: The reference folder to use when calling `require` inside the setup function. This will simulate that the benchmark is running inside this folder instead of the internal one, so NodeJS will search for the proper `node_modules` or relative files to this `__dirname`. Defaults to **process.cwd()**.
    - `parallel`: The amount of parallel tests to run. Although a test may end before its predecessor, the log output will honor the test order. Defaults to **1**.
    - `ms`: The minimum time to invest on each test. The library will automatically increase the amount of cycles to reach a minimum of `minMs` between tests to take samples. Defaults to **1000**.
    - `minMs`: The minimum time to invest on each cycle loop, so the sample is taken into account to calculate the performance. Defaults to **100**.
- `setup`: A function that will be run inside the new process to setup before running the test. Can return a `Promise`. Will receive as arguments the extra arguments that you add to the constructor. Has to return an array that will be used as arguments for the test functions.
- `args`: The arguments that you can pass to the setup from the main thread. These arguments will be serialized using: [v8.serialize()](https://nodejs.org/api/v8.html).
---
```javascript
scope.add(name, test);
```
Adds new test.
- `name`: The name of this test.
- `test`: The test function to run. Will receive as arguments the elements returned by the `setup` function.
---
```javascript
scope.log(...log);
```
Logs data in the console.
- `log`: This will call `console.log` with the arguments passed.
---
```javascript
scope.output(...log?);
```
Shows the output (no speed comparison) of the last tests since the last `result` or `output` calls (or since the first test if no previous `result` or `output` calls happened).
- `log`: This will call `console.log` with the arguments passed. Optional.
---
```javascript
scope.result(...log?);
```
Shows the result (with speed comparison) of the last tests since the last `result` call (or since the first test if no previous `result` call happened).
- `log`: This will call `console.log` with the arguments passed. Optional.
---
```javascript
scope.run();
```
Runs the tests and shows the outputs in order. Returns a `Promise` that will resolve when all the tests are completed.