declare type Copy<T> = T extends Array<T> ? T : T;
export declare namespace IsoBench {
    enum STRINGS {
        WORSE = "WORSE",
        BEST = "BEST",
        COMPLETED = "[TESTS COMPLETED]"
    }
    type ScopeOptions = {
        __dirname?: string;
        parallel?: number;
        ms?: number;
        minMs?: number;
    };
    class Scope<T_ARGS extends any[], T_SCOPE extends readonly any[]> {
        private _args;
        private _setup;
        private _scripts;
        private _doneScripts;
        private _loggedScripts;
        private _logData;
        private _running;
        private _requirePaths;
        private _endCb;
        readonly options: Required<ScopeOptions>;
        started: boolean;
        constructor(options?: ScopeOptions, _setup?: (...args: Copy<T_ARGS>) => Promise<T_SCOPE> | T_SCOPE, ...args: T_ARGS);
        add(name: string, cb: (...args: T_SCOPE) => any): this;
        log(...log: any[]): this;
        output(...log: any[]): this;
        result(...log: any[]): this;
        run(): Promise<void>;
        private _logPack;
        private _checkOutput;
        private _next;
        private _getWorkerScript;
        private _checkDataResult;
        private _runWorker;
    }
}
export {};
