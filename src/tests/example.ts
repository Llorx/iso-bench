import { IsoBench } from "..";

const dates = new Array(1000).fill(0).map(() => new Date(Math.floor(Date.now() - (Math.random() * 1000000000))));

const bench = new IsoBench("test");
bench.add("iso", () => {
  let res = 0;
  for (const date of dates) {
    res += Buffer.byteLength(date.toISOString());
  }
});
bench.add("calc", () => {
  let res = 0;
  for (const date of dates) {
    res += Buffer.byteLength(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")}.${String(date.getUTCMilliseconds()).padStart(3, "0")}`);
  }
});
bench.consoleLog().run();