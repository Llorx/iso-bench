import { IsoBench } from "..";
const functions = {
  method: function(buf:Buffer) {
      return buf.readUint32LE(0);
  },
  direct: function(buf:Buffer) {
      return ((buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + (buf[3])) >>> 0;
  },
  method_again: function(buf:Buffer) {
      return buf.readUint32LE(0);
  }
};
const buffers = new Array(1000).fill(0).map(() => {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUint32LE(Math.floor(Math.random() * 0xFFFFFFFF));
  return buf;
});

const bench = new IsoBench("test");
for (const [type, fn] of Object.entries(functions)) {
  bench.add(`${type}`, () => {
      for (let i = 0; i < buffers.length; i++) {
          fn(buffers[i]);
      }
  });
}
bench.run();