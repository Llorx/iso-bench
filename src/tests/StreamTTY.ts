import { TTYOutput } from "../processors/StreamLog/TTYOutput";

const tty = new TTYOutput(process.stdout);
for (let i = 0; i < 10; i++) {
    setTimeout(() => {
        tty.log("test" + i, i);
    }, 500 * i);
}
setTimeout(() => {
    for (let i = 0; i < 10; i++) {
        setTimeout(() => {
            tty.log("test" + i + "_", i);
        }, 5000 * Math.random());
    }
    setTimeout(() => {
        tty.end();
    }, 500 * 11);
}, 500 * 11);