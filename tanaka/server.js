const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const EngineManager = require("./engineManager");
const { listEngines, enginePath } = require("./engineRegistry");

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, "public");
const RESULTS_DIR = path.join(__dirname, "results");   // 対局結果を保存するフォルダ

// 画面から局面が届かなかったときに使う、配置が終わったあとの局面
const DEFAULT_SFEN = "lsgkbn/pppppp/6/6/PPPPPP/NBKGSL b - 1";

// 画面から届いた局面が、66将棋の SFEN として正しい形か調べる
function isValidSfen(sfen) {
    if (typeof sfen !== "string") return false;
    const parts = sfen.split(" ");
    if (parts.length !== 4 || !["b", "w"].includes(parts[1])) return false;
    const rows = parts[0].split("/");
    if (rows.length !== 6) return false;
    return rows.every(row => {
        if (!/^(\+?[plsngkbrPLSNGKBR]|[1-6])+$/.test(row)) return false;
        const width = row.replace(/\+/g, "").split("").reduce((n, ch) => n + (/\d/.test(ch) ? Number(ch) : 1), 0);
        return width === 6;
    });
}

// ランダムな配置の局面を作る（placement.js と同じルール：飛と角はどちらか片方）
function randomPlacementSfen() {

    function randomRow() {
        const pieces = ["K", "G", "S", "N", "L", Math.random() < 0.5 ? "R" : "B"];
        // 並びをシャッフルする
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }
        return pieces.join("");
    }

    const gote = randomRow().toLowerCase();
    const sente = randomRow();
    return `${gote}/pppppp/6/6/PPPPPP/${sente} b - 1`;
}

// CSV の1つの欄にする（カンマや " が入っていても崩れないように " で囲む）
function csvField(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
}

// 今の日時を "20261031-164012" の形にする（ファイル名に使う）
function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

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

let manager = null;          // 対局中なら EngineManager が入る
let stopRequested = false;   // 「中断」が押されたら true

// ブラウザに送る
function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

wss.on("connection", ws => {

    console.log("画面がつながりました");

    // engines フォルダを調べて、エンジンの一覧を画面に知らせる
    async function sendEngineList() {
        engineList = await listEngines();
        send(ws, { type: "engines", list: engineList });
    }

    let engineList = [];
    sendEngineList();

    ws.on("message", async msg => {

        const data = JSON.parse(msg.toString());

        // ---- エンジンの一覧を調べ直す ----
        if (data.type === "refresh") {
            await sendEngineList();
            return;
        }

        // ---- 対局開始 ----
        // 例: { type: "start",
        //       sente: { file: "greedy-ai", options: { RandomMove: "true" } },
        //       gote:  { file: "fairy-stockfish-mac", options: {} },
        //       sfen: "...",            配置した局面
        //       games: 10,              対局数
        //       swap: true,             1局ごとに先後を入れ替えるか
        //       randomPlacement: true,  1局ごとにランダムに配置するか
        //       byoyomi: 1000,          1手に考える時間（ミリ秒）
        //       minMoveTime: 300 }      1手に最低かける時間（ミリ秒）
        if (data.type === "start") {

            if (manager) {
                send(ws, { type: "error", message: "対局中です" });
                return;
            }

            // 画面で選んだエンジンが、engines フォルダにあるか確かめる
            const firstInfo = engineList.find(e => e.file === data.sente?.file);
            const secondInfo = engineList.find(e => e.file === data.gote?.file);
            if (!firstInfo || !secondInfo) {
                send(ws, { type: "error", message: "エンジンが見つかりません。一覧を更新してください" });
                return;
            }

            // 1局目の先手を A、後手を B と呼ぶ（先後を入れ替えても、どちらのエンジンか分かるように）
            const players = {
                A: { name: firstInfo.name, path: enginePath(firstInfo.file), options: data.sente.options || {} },
                B: { name: secondInfo.name, path: enginePath(secondInfo.file), options: data.gote.options || {} },
            };

            const games = Math.min(Math.max(Number(data.games) || 1, 1), 1000);
            const placedSfen = isValidSfen(data.sfen) ? data.sfen : DEFAULT_SFEN;

            manager = new EngineManager({
                byoyomi: Number(data.byoyomi) || 1000,
                maxMoves: 200,
                minMoveTime: Number(data.minMoveTime) || 0,
            });
            stopRequested = false;

            // 1手指すたびに、画面に送る
            manager.on("move", move => send(ws, { type: "move", ...move }));

            // 結果を書き出すファイル（results/20261031-164012.csv）
            fs.mkdirSync(RESULTS_DIR, { recursive: true });
            const fileName = timestamp() + ".csv";
            const filePath = path.join(RESULTS_DIR, fileName);
            fs.writeFileSync(filePath,
                "﻿" + ["対局", "先手", "後手", "勝ち", "理由", "手数", "開始局面", "指し手"].map(csvField).join(",") + "\n");

            // 集計
            const summary = { A: 0, B: 0, draw: 0, games: 0, totalMoves: 0 };

            try {
                await manager.startEngines(players.A, players.B);

                let aIsSente = true;   // 今の対局で A が先手か

                for (let game = 1; game <= games; game++) {

                    const sfen = data.randomPlacement ? randomPlacementSfen() : placedSfen;
                    const senteName = aIsSente ? "A" : "B";
                    const goteName = aIsSente ? "B" : "A";

                    send(ws, {
                        type: "started", game, total: games, sfen,
                        sente: `${senteName}: ${players[senteName].name}`,
                        gote: `${goteName}: ${players[goteName].name}`,
                    });

                    const result = await manager.playGame(sfen);

                    // 勝ったのは A と B のどちらか
                    const winner = result.winner === "sente" ? senteName
                                 : result.winner === "gote" ? goteName
                                 : null;

                    if (winner) summary[winner]++;
                    else summary.draw++;
                    summary.games++;
                    summary.totalMoves += result.moves.length;

                    // 1局終わるごとにファイルに書き足す（途中で止めても、そこまでの結果は残る）
                    fs.appendFileSync(filePath, [
                        game,
                        `${senteName}: ${players[senteName].name}`,
                        `${goteName}: ${players[goteName].name}`,
                        winner ? `${winner}: ${players[winner].name}` : "引き分け",
                        result.reason,
                        result.moves.length,
                        sfen,
                        result.moves.join(" "),
                    ].map(csvField).join(",") + "\n");

                    send(ws, {
                        type: "end", game, total: games,
                        sente: `${senteName}: ${players[senteName].name}`,
                        gote: `${goteName}: ${players[goteName].name}`,
                        winner: winner ? `${winner}: ${players[winner].name}` : null,
                        winnerSide: result.winner,
                        reason: result.reason,
                        moves: result.moves.length,
                    });

                    if (stopRequested) break;

                    // 先後を入れ替える
                    if (data.swap) {
                        manager.swapSides();
                        aIsSente = !aIsSente;
                    }
                }
            } finally {
                manager.stopEngines();
                manager = null;
            }

            send(ws, {
                type: "series-end",
                summary: { ...summary, nameA: players.A.name, nameB: players.B.name },
                file: path.join("results", fileName),
            });
            console.log("対局結果を保存しました:", path.join("results", fileName));
        }

        // ---- 中断（今の対局を止めて、連続対局も終わる） ----
        if (data.type === "stop" && manager) {
            stopRequested = true;
            manager.stopGame();
        }
    });

    // 画面を閉じたら、対局を止める
    ws.on("close", () => {
        if (manager) {
            stopRequested = true;
            manager.stopGame();
        }
    });
});

server.listen(PORT, () => {
    console.log(`ブラウザで http://localhost:${PORT} を開いてください`);
});
