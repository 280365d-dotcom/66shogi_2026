// =========================
// placers フォルダにある配置AI（実行ファイル）を調べて、一覧にする
//   エンジンの engines フォルダと同じ考え方。自分でコンパイルした実行ファイルを入れておく
//   例: g++ -O2 -std=c++17 -o placers/random placers/random.cpp
// =========================
const fs = require("fs");
const path = require("path");

const PLACER_DIR = path.join(__dirname, "placers");   // 配置AIを入れるフォルダ

// 実行ファイルかどうか調べる
//   Windows は .exe で終わるもの、Mac・Linux は「実行してよい」許可がついているもの
function isExecutable(filePath) {
    if (!fs.statSync(filePath).isFile()) return false;          // フォルダは除く
    if (process.platform === "win32") return filePath.endsWith(".exe");
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch (err) {
        return false;                                            // .cpp など、実行できないファイル
    }
}

// placers フォルダの実行ファイルを一覧にする
// 返すもの: [{ file: "random", ok: true }, ...]
function listPlacers() {
    if (!fs.existsSync(PLACER_DIR)) return [];

    return fs.readdirSync(PLACER_DIR)
        .filter(file => !file.startsWith("."))                  // .DS_Store などの隠しファイルは除く
        .filter(file => isExecutable(path.join(PLACER_DIR, file)))
        .sort()
        .map(file => ({ file, ok: true }));
}

// "random" → 配置AIの場所（placers/random）
function placerPath(file) {
    return path.join(PLACER_DIR, path.basename(file));
}

module.exports = { listPlacers, placerPath };
