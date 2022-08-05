"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsoBench = void 0;
const MultiWorker_1 = require("./MultiWorker");
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
    ;
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
            let worker = new MultiWorker_1.MultiWorker(this._getWorkerScript(data));
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
})(IsoBench = exports.IsoBench || (exports.IsoBench = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0NBQTRDO0FBd0I1QyxTQUFTLFlBQVksQ0FBQyxHQUFpQztJQUNuRCxPQUFPLFFBQVEsSUFBSSxHQUFHLENBQUM7QUFDM0IsQ0FBQztBQUNELFNBQVMsWUFBWSxDQUFDLEdBQWlDO0lBQ25ELE9BQU8sT0FBTyxJQUFJLEdBQUcsQ0FBQztBQUMxQixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsRUFBdUI7SUFDNUMsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3pCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdkgsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQzdCLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztLQUM5RTtTQUFNO1FBQ0gsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNyRCxJQUFJLElBQUks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