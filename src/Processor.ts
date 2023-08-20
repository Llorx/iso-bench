import { IsoBench } from "./IsoBench";
import { Sample, Test } from "./Test";

export interface Processor {
    initialize?(bench:IsoBench, tests:Test[]):void;
    start?(test:Test):void;
    sample?(test:Test, sample:Sample):void;
    end?(test:Test):void;
    completed?(tests:Test[]):void;
}