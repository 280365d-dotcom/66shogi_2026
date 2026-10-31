// =========================
// engines フォルダにあるエンジンを調べる
// =========================
const fs = require("fs");
const path = require("path");
const Engine = require("./engine");

const ENGINE_DIR = path.join(__dirname, "engines");

// 調べた結果を覚えておく（ファイルが変わっていなければ、もう一度起動しない）
const cache = new Map();

// エンジンを一瞬だけ起動して、usi の返事（名前とオプションの一覧）を受け取る
async function probe(filePath) {

    const engine = new Engine(filePath);
    engine.start();

    // 返ってきた行を全部ためておく
    const lines = [];
    engine.listeners.push(line => lines.push(line));

    engine.send("usi");

    // usiok が来るか、5秒たつまで待つ
    const ok = await Promise.race([
        engine.waitFor(line => line === "usiok").then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)),
    ]);

    engine.stop();

    if (!ok) return null;   // USI エンジンではなかった

    const info = { name: path.basename(filePath), author: "", options: [] };

    for (const line of lines) {
        if (line.startsWith("id name ")) info.name = line.slice(8);
        if (line.startsWith("id author ")) info.author = line.slice(10);
        if (line.startsWith("option name ")) info.options.push(parseOption(line));
    }

    return info;
}

// "option name X type spin default 1 min 1 max 512" を読み取る
function parseOption(line) {

    const words = line.split(" ");
    const option = { name: "", type: "", default: "", min: null, max: null, vars: [] };

    // "name" "type" などの言葉の、次の言葉が値
    for (let i = 1; i < words.length; i++) {
        const key = words[i];
        const value = words[i + 1];
        if (key === "name") { option.name = value; i++; }
        else if (key === "type") { option.type = value; i++; }
        else if (key === "default") { option.default = value === undefined ? "" : value; i++; }
        else if (key === "min") { option.min = Number(value); i++; }
        else if (key === "max") { option.max = Number(value); i++; }
        else if (key === "var") { option.vars.push(value); i++; }
    }

    return option;
}

// engines フォルダのエンジンの一覧を返す
// 例: [{ file: "greedy-ai", name: "Greedy-AI 311026 LB", options: [...] }, ...]
async function listEngines() {

    let files = [];
    try {
        files = fs.readdirSync(ENGINE_DIR).filter(f => !f.startsWith("."));
    } catch {
        return [];   // engines フォルダがない
    }

    const list = [];

    for (const file of files) {

        const filePath = path.join(ENGINE_DIR, file);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;

        // 前に調べたときからファイルが変わっていなければ、覚えている結果を使う
        const key = file + ":" + stat.mtimeMs;
        if (!cache.has(key)) {
            cache.set(key, await probe(filePath));
        }

        const info = cache.get(key);
        if (info) {
            list.push({ file, ...info });
        } else {
            console.error("USI エンジンとして起動できませんでした:", file);
        }
    }

    return list;
}

// ファイル名から、エンジンの場所を返す（engines フォルダの外は使わせない）
function enginePath(file) {
    return path.join(ENGINE_DIR, path.basename(String(file)));
}

module.exports = { listEngines, enginePath };
