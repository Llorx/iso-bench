import FS from "fs";

import { IsoBench } from "..";

const buffers = new Array(1000).fill(0).map(() => Buffer.allocUnsafe(1));
buffers.forEach(buffer => buffer[0] = Math.floor(Math.random() * 0xFF));

const bench = new IsoBench("MyBench");
bench
.add("readUint8", () =>{
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
})
.add("direct", () =>{
  for (const buffer of buffers) {
    buffer[0];
  }
})
.endGroup("yay...")
.add("direct", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
})
.add("readUint8", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
}).endGroup("yay...2")
.add("direct", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
})
.add("readUint8", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
}).endGroup("yay...3")
.add("direct", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
})
.add("readUint8", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
}).endGroup("yay...4")
.add("direct", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
})
.add("readUint8", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
}).endGroup("yay...5")
.add("direct", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
})
.add("readUint8", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
}).endGroup("yay...6")
.add("direct", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
})
.add("readUint8", () => {
  for (const buffer of buffers) {
    buffer.readUint8(0);
  }
}).endGroup("yay...7")
.streamLog(() => FS.createWriteStream("test.txt")).run();