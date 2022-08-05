"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scope = void 0;
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
class Scope {
    static STRINGS = {
        WORSE: "WORSE",
        BEST: "BEST",
        COMPLETED: "[TESTS COMPLETED]"
    };
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
            maxThreads: 1,
            ms: 1000,
            ...options
        };
        this._setup = _setup ? `let _args_ñ = eval(${String(_setup)})(..._data_ñ.args);` : "";
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
                data.log.push(`${data.opMs === min ? Scope.STRINGS.WORSE : ""}${data.opMs === max ? Scope.STRINGS.BEST : ""}`);
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
        if (this._running < this.options.maxThreads) {
            let data = this._scripts.shift();
            if (data) {
                this._runWorker(data);
            }
            else {
                if (this._doneScripts.length > 0) {
                    this._logPack(false);
                }
                console.log(Scope.STRINGS.COMPLETED);
                let endCb = this._endCb;
                this._endCb = null;
                endCb();
            }
        }
    }
    _runWorker(data) {
        this._running++;
        let script = `parent.addEventListener("message", _event_ñ => {
            try {
                const _data_ñ = _d_ñ(_event_ñ.data);
                ${this._setup}
                ${data.script.evalArgs}
                const _n_ñ = _now_ñ();
                for (let _i_ñ = 0; _i_ñ < ${data.cycles}; _i_ñ++) {
                    ${data.script.body}
                }
                const _diff_ñ = _dif_ñ(_n_ñ);
                parent.postMessage({ done: _diff_ñ });
            } catch (e) {
                parent.postMessage({ error: String(e) });
            }
            close();
        });`;
        let worker = new MultiWorker_1.MultiWorker(script);
        worker.addEventListener("message", event => {
            if (!event.data) {
                event = {
                    data: event
                };
            }
            if (event.data.log) {
                console.log(...event.data.log);
            }
            else {
                this._running--;
                if (event.data.error != null) {
                    data.log = [data.name, "-", event.data.error];
                    data.opMs = 0;
                    this._doneScripts.push(data);
                    this._checkOutput();
                }
                else {
                    let ms = event.data.done;
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
        });
        worker.addEventListener("error", console.error);
        worker.postMessage({
            args: this._args || []
        });
    }
}
exports.Scope = Scope;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2NvcGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvU2NvcGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0NBQTRDO0FBd0I1QyxTQUFTLFlBQVksQ0FBQyxHQUFpQztJQUNuRCxPQUFPLFFBQVEsSUFBSSxHQUFHLENBQUM7QUFDM0IsQ0FBQztBQUNELFNBQVMsWUFBWSxDQUFDLEdBQWlDO0lBQ25ELE9BQU8sT0FBTyxJQUFJLEdBQUcsQ0FBQztBQUMxQixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsRUFBdUI7SUFDNUMsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3pCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdkgsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQzdCLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztLQUM5RTtTQUFNO1FBQ0gsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNyRCxJQUFJLElBQUks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