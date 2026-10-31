const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const EngineManager = require("./engineManager");

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, "public");

// 使えるエンジンの一覧（あとで engines.json に移す）
const ENGINES = [
    { name: "ランダムAI",             path: "./fairy-stockfish-mac", options: { RandomMove: "true" } },
    { name: "欲張りAI",               path: "./greedy-ai",           options: { RandomMove: "true" } },
    { name: "Fairy-Stockfish（本気）", path: "./fairy-stockfish-mac", options: { RandomMove: "false" } },
];

// 配置が終わったあとの局面（あとで配置フェーズを作る）
const START_SFEN = "lsgkbn/pppppp/6/6/PPPPPP/NBKGSL b - 1";

// =========================
// 1. 画面のファイル（public フォルダ）を配信する
// =========================
const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "text/javascript; charset=utf-8",
};

const server = http.createServer((req, res) => {

    // "/" が来たら index.html を返す
    const urlPath = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));

    // public フォルダの外のファイルは返さない
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end();
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream" });
        res.end(data);
    });
});

// =========================
// 2. ブラウザとやり取りする（WebSocket）
// =========================
const wss = new WebSocket.Server({ server });

let manager = null;   // 対局中なら EngineManager が入る

// ブラウザに送る
function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

wss.on("connection", ws => {

    console.log("画面がつながりました");

    // つながったら、使えるエンジンの名前を知らせる
    send(ws, { type: "engines", list: ENGINES.map(e => e.name) });

    ws.on("message", async msg => {

        const data = JSON.parse(msg.toString());

        // ---- 対局開始 ----
        // 例: { type: "start", sente: 1, gote: 0 }（数字は ENGINES の番号）
        if (data.type === "start") {

            if (manager) {
                send(ws, { type: "error", message: "対局中です" });
                return;
            }

            const sente = ENGINES[data.sente];
            const gote = ENGINES[data.gote];

            manager = new EngineManager({ byoyomi: 1000, maxMoves: 200, minMoveTime: 300 });

            // 1手指すたびに、画面に送る
            manager.on("move", move => send(ws, { type: "move", ...move }));

            send(ws, { type: "started", sfen: START_SFEN, sente: sente.name, gote: gote.name });

            try {
                await manager.startEngines(sente, gote);
                const result = await manager.playGame(START_SFEN);
                send(ws, { type: "end", ...result });
            } finally {
                manager.stopEngines();
                manager = null;
            }
        }

        // ---- 中断 ----
        if (data.type === "stop" && manager) {
            manager.stopGame();
        }
    });

    // 画面を閉じたら、対局を止める
    ws.on("close", () => {
        if (manager) manager.stopGame();
    });
});

server.listen(PORT, () => {
    console.log(`ブラウザで http://localhost:${PORT} を開いてください`);
});
