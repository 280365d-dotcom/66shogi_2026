const WebSocket = require("ws");
const { spawn } = require("child_process");

const wss = new WebSocket.Server({
    port: 8080
});

// MacでもWindowsでも動く
const path = require("path");

const engineFile = 
    process.platform == "win32"
        ? "fairy-stockfish-tools.exe"
        : "fairy-stockfish-mac";

const engine = spawn(
    path.join(__dirname, engineFile),
    [],
    { cwd: __dirname }
);


// 起動するときに指定した AI の名前を使う
// 例: node server.js greedy-ai → aiName = "greedy-ai"
// 何も指定しなければ random-ai を使う
const aiName = process.argv[2] || "random-ai";

// Windows なら最後に .exe を付ける
const aiFile = 
    process.platform === "win32"
        ? aiName + ".exe"
        : aiName;

// どの AI を使うかターミナルに表示する（確認用）
console.log("使うAI:", aiFile);

// C++ の AI を起動する
// ターミナルで ./random-ai と打つのと同じこと
const ai = spawn(
    path.join(__dirname, aiFile),
    [],
    { cwd: __dirname }
);

// 起動に失敗したとき（ファイルが見つからないなど）にエラーを表示する
ai.on("error", err => {
    console.error("AIを起動できません:", err.message);
})

// C++ の AI からの返事を、ブラウザに送る
ai.stdout.on("data", data => {
    const text = data.toString();
    console.log("AI:", text);
    wss.clients.forEach(client => {
        if(client.readyState === WebSocket.OPEN) {
            client.send(text);
        }
    });
});

engine.stdout.on("data", data => {

    const text = data.toString();

    console.log(text);

    wss.clients.forEach(client => {

        if(client.readyState === WebSocket.OPEN){

            client.send(text);

        }
    });

});

wss.on("connection", ws => {

    console.log("GUI Connected");

    // ブラウザから命令が届いたら、ここが実行される
    ws.on("message", msg => {

        // 届いた命令を文字列にする
        const text = msg.toString();

        if(text.startsWith("ai ")) {
            // "ai " で始まる命令 → C++ の AI へ送る
            // 先頭の "ai " (3文字) を取り除いてから送る
            // 例: "ai moves 6b6c 5b5c" → "moves 6b6c 5b5c"
            // 最後の "\n" は改行（C++ は1行ずつ読むので必要）
            ai.stdin.write(text.slice(3) + "\n");
        } else {
            // それ以外の命令 → fairy-stockfish へ送る
            // 例: "usi", "position ...", "go perft 1"
            engine.stdin.write(text + "\n");
        }
    });

});