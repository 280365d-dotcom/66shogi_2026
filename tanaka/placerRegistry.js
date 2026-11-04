// =========================
// placers フォルダにある配置AI（.cpp）を調べて、コンパイルする
// =========================
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PLACER_DIR = path.join(__dirname, "placers");        // .cpp を入れるフォルダ
const BUILD_DIR = path.join(PLACER_DIR, "build");          // コンパイルしたプログラムを置くフォルダ
const COMPILER = process.env.CXX || "g++";                 // 使うコンパイラ（Mac の g++ は clang++ と同じもの）
const EXE = process.platform === "win32" ? ".exe" : "";    // Windows は .exe が付く

// .cpp をコンパイルする。成功したら null、失敗したらエラーの文を返す
function compile(source, output) {
    return new Promise(resolve => {
        // placers フォルダの中で実行する（エラーの文に長いフォルダ名が出ないように）
        execFile(COMPILER, ["-O2", "-std=c++17", "-o", output, path.basename(source)], { cwd: PLACER_DIR }, (err, stdout, stderr) => {
            resolve(err ? (stderr || err.message) : null);
        });
    });
}

// placers フォルダの .cpp を一覧にする。プログラムが古ければ（.cpp のほうが新しければ）コンパイルし直す
// 返すもの: [{ file: "random.cpp", ok: true, error: null }, ...]
async function listPlacers() {

    fs.mkdirSync(BUILD_DIR, { recursive: true });

    const files = fs.readdirSync(PLACER_DIR).filter(f => f.endsWith(".cpp")).sort();
    const list = [];

    for (const file of files) {
        const source = path.join(PLACER_DIR, file);
        const output = placerPath(file);

        let error = null;
        const needBuild = !fs.existsSync(output)
            || fs.statSync(output).mtimeMs < fs.statSync(source).mtimeMs;

        if (needBuild) {
            console.log("配置AIをコンパイルします:", file);
            error = await compile(source, output);
            if (error) console.error(`${file} のコンパイルに失敗しました\n${error}`);
        }

        list.push({ file, ok: error === null, error });
    }
    return list;
}

// "random.cpp" → コンパイルしたプログラムの場所（placers/build/random）
function placerPath(file) {
    return path.join(BUILD_DIR, path.basename(file, ".cpp") + EXE);
}

module.exports = { listPlacers, placerPath };
