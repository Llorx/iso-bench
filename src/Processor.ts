import { Result } from "./Result";

export interface Processor {
    end?(result:Result):void;
}