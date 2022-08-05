const isBrowser = new Function("try {return this===window;}catch(e){ return false;}");

import type { Worker as NodeWorker } from "worker_threads";

const BROWSER_INJECTION = _browserInjection.toString().substring(_browserInjection.toString().indexOf("{") + 1, _browserInjection.toString().lastIndexOf("}"));
const NODE_INJECTION = _nodeInjection.toString().substring(_nodeInjection.toString().indexOf("{") + 1, _nodeInjection.toString().lastIndexOf("}"));

export class MultiWorker {
    private _browserWorker:Worker = null as unknown as Worker;
    private _nodeWorker:NodeWorker = null as unknown as NodeWorker;
    constructor(script:string) {
        if (isBrowser()) {
            script = `${BROWSER_INJECTION}\r\n${script}`;
            this._browserWorker = new Worker(`data:text/javascript;charset=UTF-8,${encodeURIComponent(script)}`);
        } else {
            script = `${NODE_INJECTION}\r\n${script}`;
            this._nodeWorker = new (require("worker_threads").Worker as typeof NodeWorker)(script, {
                eval: true
            });
        }
    }
    addEventListener<K extends keyof WorkerEventMap>(type: K, listener: (this: Worker, ev: WorkerEventMap[K]) => any): void;
    addEventListener(type: string, listener:(...args:any)=>any) {
        if (this._browserWorker) {
            this._browserWorker.addEventListener(type, listener);
        } else {
            this._nodeWorker.on(type, listener);
        }
    }
    postMessage(msg:any) {
        if (this._browserWorker) {
            this._browserWorker.postMessage(msg);
        } else {
            this._nodeWorker.postMessage(require("v8").serialize(msg));
        }
    }
}
function _browserInjection() {
    const _d_ñ = (v:any) => v;
    const _now_ñ = performance.now;
    const _dif_ñ = (d:number) => _now_ñ() - d;
    console.log = (...args:any[]) => {
        parent.postMessage({ log: args });
    };
}
function _nodeInjection() {
    const parent = require("worker_threads").parentPort;
    const performance = require("perf_hooks").performance;
    const _d_ñ = (v:Uint8Array) => require("v8").deserialize(v);
    const _now_ñ = process.hrtime.bigint;
    const _dif_ñ = (d:bigint) => Number(_now_ñ() - d) / 1000000;
    console.log = (...args:any[]) => {
        parent.postMessage({ log: args });
    };
    const close = process.exit;
}