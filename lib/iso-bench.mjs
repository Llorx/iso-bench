const isBrowser = new Function("try {return this===window;}catch(e){ return false;}");
const BROWSER_INJECTION = `
const _d_ñ = v => v;
const _now_ñ = performance.now;
const _dif_ñ = d => _now_ñ() - d;
console.log = (...args) => {
    parent.postMessage({ log: args });
};
`;
const NODE_INJECTION = `
const parent = require("worker_threads").parentPort;
const performance = require("perf_hooks").performance;
const _d_ñ = v => require("v8").deserialize(v);
const _now_ñ = process.hrtime.bigint;
const _dif_ñ = d => Number(_now_ñ() - d) / 1000000;
console.log = (...args) => {
    parent.postMessage({ log: args });
};
const close = process.exit;
`;
class MultiWorker {
    _browserWorker = null;
    _nodeWorker = null;
    constructor(script) {
        if (isBrowser()) {
            script = `${BROWSER_INJECTION}\r\n${script}`;
            this._browserWorker = new Worker(`data:text/javascript;charset=UTF-8,${encodeURIComponent(script)}`);
        }
        else {
            script = `${NODE_INJECTION}\r\n${script}`;
            this._nodeWorker = new (require("worker_threads").Worker)(script, {
                eval: true
            });
        }
    }
    addEventListener(type, listener) {
        if (this._browserWorker) {
            this._browserWorker.addEventListener(type, listener);
        }
        else {
            this._nodeWorker.on(type, listener);
        }
    }
    postMessage(msg) {
        if (this._browserWorker) {
            this._browserWorker.postMessage(msg);
        }
        else {
            this._nodeWorker.postMessage(require("v8").serialize(msg));
        }
    }
}

function isScriptData(res) {
    return "script" in res;
}
function isOutputData(res) {
    return "clear" in res;
}
function processFunction(fn) {
    let body = fn.toString();
    let args = body.substring(body.indexOf("(") + 1, body.indexOf(")")).split(",").map(el => el.trim()).filter(el => !!el);
    if (body.startsWith("function")) {
        body = body.substring(body.indexOf("{") + 1, body.lastIndexOf("}")).trim();
    }
    else {
        body = body.substring(body.indexOf("=>") + 2).trim();
        if (body.startsWith("{") && body.endsWith("}")) {
            body = body.substring(1, body.length - 1).trim();
        }
    }
    let evalArgs = [];
    for (let i = 0; i < args.length; i++) {
        evalArgs.push(`let ${args[i]} = _args_ñ[${i}];`);
    }
    return { args, body, evalArgs: evalArgs.join("\r\n") };
}
var IsoBench;
(function (IsoBench) {
    let STRINGS;
    (function (STRINGS) {
        STRINGS["WORSE"] = "WORSE";
        STRINGS["BEST"] = "BEST";
        STRINGS["COMPLETED"] = "[TESTS COMPLETED]";
    })(STRINGS = IsoBench.STRINGS || (IsoBench.STRINGS = {}));
    class Scope {
        _args;
        _setup;
        _scripts = [];
        _doneScripts = [];
        _loggedScripts = new Set();
        _logData = [];
        _running = 0;
        _endCb = null;
        ;
        options;
        started = false;
        constructor(options = {}, _setup, ...args) {
            this.options = {
                parallel: 1,
                ms: 1000,
                ...options
            };
            this._setup = _setup ? `let _args_ñ = await eval(${String(_setup)})(..._data_ñ.args);` : "";
            this._args = args;
        }
        add(name, cb) {
            let data = {
                name: name,
                samples: 0,
                opMs: -1,
                totalTime: 0,
                cycles: 100,
                script: processFunction(cb)
            };
            this._scripts.push(data);
            this._logData.push(data);
            return this;
        }
        log(...log) {
            this._logData.push({
                log: log
            });
            return this;
        }
        output(...log) {
            this._logData.push({
                log: log,
                clear: false
            });
            return this;
        }
        result(...log) {
            this._logData.push({
                log: log,
                clear: true
            });
            return this;
        }
        run() {
            return new Promise((resolve, reject) => {
                if (!this.started) {
                    this.started = true;
                    this._endCb = resolve;
                    this._checkOutput();
                    this._next();
                }
                else {
                    reject(new Error("Already running"));
                }
            });
        }
        _logPack(clear) {
            let toLog = this._doneScripts.slice();
            if (!clear) {
                for (let script of this._loggedScripts) {
                    toLog.splice(toLog.indexOf(script), 1);
                }
            }
            let ops = toLog.map(el => el.opMs);
            let min = Math.min(...ops.filter(n => !!n));
            let max = Math.max(...ops.filter(n => !!n));
            for (let data of toLog) {
                this._loggedScripts.add(data);
                if (clear && data.opMs > 0) {
                    data.log.push(`${(data.opMs / min).toFixed(3)}x`);
                    data.log.push(`${data.opMs === min ? STRINGS.WORSE : ""}${data.opMs === max ? STRINGS.BEST : ""}`);
                }
                console.log(...data.log);
            }
            if (clear) {
                this._doneScripts.splice(0);
                this._loggedScripts.clear();
            }
        }
        _checkOutput() {
            while (this._logData.length > 0 && this._logData[0].log) {
                if (!isScriptData(this._logData[0]) && this._logData[0].log.length > 0) {
                    console.log(...this._logData[0].log);
                }
                if (isOutputData(this._logData[0])) {
                    this._logPack(this._logData[0].clear);
                }
                this._logData.shift();
            }
        }
        _next() {
            if (this._running < this.options.parallel) {
                let data = this._scripts.shift();
                if (data) {
                    this._runWorker(data);
                }
                else {
                    this._logPack(false);
                    console.log(STRINGS.COMPLETED);
                    this._endCb && this._endCb();
                }
            }
        }
        _getWorkerScript(data) {
            return `parent.addEventListener("message", async _event_ñ => {
                try {
                    const _data_ñ = _d_ñ(_event_ñ.data);
                    ${this._setup}
                    ${data.script.evalArgs}
                    const _n_ñ = _now_ñ();
                    for (let _i_ñ = 0; _i_ñ < ${data.cycles}; _i_ñ++) {
                        ${data.script.body}
                    }
                    const _diff_ñ = _dif_ñ(_n_ñ);
                    parent.postMessage({ diff: _diff_ñ });
                } catch (e) {
                    parent.postMessage({ error: String(e) });
                }
                close();
            });`;
        }
        _checkDataResult(data, result) {
            if ("log" in result) {
                console.log(...result.log);
                return;
            }
            else {
                this._running--;
                if ("error" in result) {
                    data.log = [data.name, "-", result.error];
                    data.opMs = 0;
                    this._doneScripts.push(data);
                    this._checkOutput();
                }
                else {
                    let ms = result.diff;
                    if (ms < 50) {
                        let r = 50 / ms;
                        data.cycles = Math.round(data.cycles * (r || 50));
                        this._scripts.unshift(data);
                    }
                    else {
                        data.samples++;
                        let ops = data.cycles / ms;
                        data.opMs = data.opMs < 0 ? ops : (data.opMs + ops) / 2;
                        data.totalTime += ms;
                        if (data.totalTime > this.options.ms) {
                            data.log = [data.name, "-", Math.round(data.opMs * 1000).toLocaleString(), "op/s.", data.samples, "workers in", Math.round(data.totalTime), "ms."];
                            this._doneScripts.push(data);
                            this._checkOutput();
                        }
                        else {
                            this._scripts.unshift(data);
                        }
                    }
                }
                this._next();
            }
        }
        _runWorker(data) {
            this._running++;
            let worker = new MultiWorker(this._getWorkerScript(data));
            worker.addEventListener("message", event => {
                if (!event.data) {
                    this._checkDataResult(data, event);
                }
                else {
                    this._checkDataResult(data, event.data);
                }
            });
            worker.addEventListener("error", console.error);
            worker.postMessage({
                args: this._args || []
            });
        }
    }
    IsoBench.Scope = Scope;
})(IsoBench || (IsoBench = {}));

export { IsoBench };
//# sourceMappingURL=iso-bench.mjs.map
