import { Serializer } from "./Serializer";

let reader = Serializer.getReader<{ args:any[], script:string, __dirname:string, __filename:string, paths:string[] }>();

process.stdin.on("data", async buffer => {
    try {
        let result = reader.process(buffer);
        if (result && result.data) {
            module.path = result.data.__dirname;
            module.filename = result.data.__filename;
            module.paths.push(...result.data.paths);
            let AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            await new AsyncFunction("require", "Serializer", "_data_ñ", result.data.script)(require, Serializer, result.data);
        }
    } catch (e) {
        process.stdout.end(Serializer.serialize({ error: String(e) }));
    }
});