import { IsoBench } from "..";
const bench = new IsoBench();
const functions = {
  direct: function(buf:Buffer) {
      return buf[0];
  },
  method: function(buf:Buffer) {
      return buf.readUint8(0);
  },
  direct_again: function(buf:Buffer) {
      return buf[0];
  },
  method_again: function(buf:Buffer) {
      return buf.readUint8(0);
  }
};
const buffers = new Array(1000).fill(0).map(() => {
  const buf = Buffer.allocUnsafe(1);
  buf[0] = Math.floor(Math.random() * 0xFF);
  return buf;
});
for (const [type, fn] of Object.entries(functions)) {
  bench.add(`${type}`, () => {
      for (let i = 0; i < buffers.length; i++) {
          fn(buffers[i]);
      }
  });
}
bench.run();