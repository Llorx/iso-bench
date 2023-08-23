import TTY from "tty";

export class StreamTTY {
    logs:string[] = [];
    top = 0;
    drawheight = 0;
    constructor(protected _stream:TTY.WriteStream) {
        this._stream.on("resize", () => {
            //this.resized();
        });
    }
    /*resized() {
        this.top = this.bottom - this._stream.rows;
        if (this.top < 0) {
            this.top = 0;
        }
    }*/
    private _drawRow(row:number, log:string) {
        const totalRows = this._stream.rows - 1; // last row is always going to be empty
        const bottom = this.top + this.drawheight;
        const currentLocation = this.drawheight;
        if (row < this.top) {
            this.top = row;
            this.redraw();
        } else if (row >= bottom) {
            const diff = row - bottom;
            this.drawheight += diff + 1;
        }
        if (this.drawheight > totalRows) {
            const diff = this.drawheight - totalRows;
            this.drawheight -= diff;
            this.top += diff;
            this.redraw();
        } else {
            const realRow = row - this.top;
            const diff = realRow - currentLocation;
            this._stream.moveCursor(0, diff);
            this._stream.cursorTo(0);
            this._stream.clearLine(0);
            this._stream.write(`${log}\n`);
            this._stream.moveCursor(0, this.drawheight - realRow - 1);
        }
    }
    log(log:string, row?:number) {
        if (row == null) {
            row = this.logs.length;
            this.logs.push("");
        }
        while (row >= this.logs.length) {
            this.log("");
        }
        this.logs[row] = log;
        this._drawRow(row, log);
        return row;
    }
    redraw() {
        this._stream.cursorTo(0, 0);
        for (let i = 0; i < this.drawheight; i++) {
            this._stream.clearLine(0);
            this._stream.write(`${this.logs[this.top + i]}\n`);
        }
    }
    end() {
        if (this.logs.length > this.drawheight) {
            this._stream.moveCursor(0, -this.drawheight);
            for (const log of this.logs) {
                this._stream.cursorTo(0);
                this._stream.clearLine(0);
                this._stream.write(`${log}\n`);
            }
        }
    }
}