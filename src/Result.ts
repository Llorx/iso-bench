import { Test } from "./Test";

export class Result {
    getTests() {
        return this._tests;
    }
    constructor(private _tests:Test[]|null) {}
}