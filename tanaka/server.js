const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const EngineManager = require("./engineManager");
const { listEngines, enginePath } = require("./engineRegistry");
const { listPlacers, placerPath } = require("./placerRegistry");

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, "public");
const RESULTS_DIR = path.join(__dirname, "results");   // 対局結果を保存するフォルダ

// 画面から局面が届かなかったときに使う、配置が終わったあとの局面
const DEFAULT_SFEN = "lsgkbn/pppppp/6/6/PPPPPP/NBKGSL b - 1";

// 配置する前の局面（歩だけが並んでいる）
const PLACEMENT_START_SFEN = "6/pppppp/6/6/PPPPPP/6 b - 1";

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
    // あわせて placers フォルダの .cpp をコンパイルして、配置AIの一覧も知らせる
    async function sendEngineList() {
        engineList = await listEngines();
        send(ws, { type: "engines", list: engineList });
        placerList = await listPlacers();
        send(ws, { type: "placers", list: placerList });
    }

    let engineList = [];
    let placerList = [];
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
        //       sente: { file: "greedy-ai", options: { RandomMove: "true" }, placer: "random.cpp" },
        //       gote:  { file: "fairy-stockfish-mac", options: {} },
        //       sfen: "...",            配置した局面
        //       games: 10,              対局数
        //       swap: true,             1局ごとに先後を入れ替えるか
        //       placementMode: "ai",    配置のしかた："manual"（画面で配置した局面）/ "random"（1局ごとにランダム）/ "ai"（配置AIが1枚ずつ交互に配置）
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

            // 配置のしかた（前の画面から送られてくる randomPlacement にも対応）
            const placementMode = data.placementMode || (data.randomPlacement ? "random" : "manual");

            // 配置AI（placers フォルダにあって、コンパイルできたものだけ使う。なければランダム）
            const findPlacer = file => placerList.find(p => p.file === file && p.ok) || null;
            const placerA = placementMode === "ai" ? findPlacer(data.sente.placer) : null;
            const placerB = placementMode === "ai" ? findPlacer(data.gote.placer) : null;

            // 名前：配置AIを使うときは「エンジン名（配置: random.cpp）」
            const label = (name, placer) => placementMode === "ai"
                ? `${name}（配置: ${placer ? placer.file : "ランダム"}）`
                : name;

            // 1局目の先手を A、後手を B と呼ぶ（先後を入れ替えても、どちらのエンジンか分かるように）
            const players = {
                A: { name: label(firstInfo.name, placerA), path: enginePath(firstInfo.file), options: data.sente.options || {} },
                B: { name: label(secondInfo.name, placerB), path: enginePath(secondInfo.file), options: data.gote.options || {} },
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

            // 配置で1枚置くたびに、画面に送る
            manager.on("place", place => send(ws, { type: "place", ...place }));

            // 結果を書き出すファイル（results/20261031-164012.csv）
            fs.mkdirSync(RESULTS_DIR, { recursive: true });
            const fileName = timestamp() + ".csv";
            const filePath = path.join(RESULTS_DIR, fileName);
            fs.writeFileSync(filePath,
                "﻿" + ["対局", "先手", "後手", "勝ち", "理由", "手数", "開始局面", "配置", "指し手"].map(csvField).join(",") + "\n");

            // 集計
            const summary = { A: 0, B: 0, draw: 0, games: 0, totalMoves: 0 };

            try {
                await manager.startEngines(players.A, players.B);
                manager.startPlacers(placerA && placerPath(placerA.file), placerB && placerPath(placerB.file));

                let aIsSente = true;   // 今の対局で A が先手か

                for (let game = 1; game <= games; game++) {

                    const senteName = aIsSente ? "A" : "B";
                    const goteName = aIsSente ? "B" : "A";
                    const isAi = placementMode === "ai";

                    // 開始局面：配置AIが配置するときは、まず歩だけの局面から始める
                    let sfen = placementMode === "random" ? randomPlacementSfen()
                             : isAi ? PLACEMENT_START_SFEN
                             : placedSfen;

                    send(ws, {
                        type: "started", game, total: games, sfen, placing: isAi,
                        sente: `${senteName}: ${players[senteName].name}`,
                        gote: `${goteName}: ${players[goteName].name}`,
                    });

                    // 配置AIに1枚ずつ交互に配置させる
                    let places = [];
                    if (isAi) {
                        const placed = await manager.placePieces();
                        if (!placed) break;   // 配置の途中で中断された
                        sfen = placed.sfen;
                        places = placed.places;
                        send(ws, { type: "placed", sfen });
                    }

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
                        places.join(" "),
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
