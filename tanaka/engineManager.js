const EventEmitter = require("events");
const Engine = require("./engine");

// 66将棋を動かすために、どのエンジンにも必ず送る設定
const VARIANT_OPTIONS = {
    VariantPath: "66shogi.ini",
    USI_Variant: "66shogi",
};

// =========================
// 先手・後手の2つのエンジンを動かして対局させる
// =========================
class EngineManager extends EventEmitter {

    // byoyomi：1手に考える時間（ミリ秒）
    // maxMoves：この手数を超えたら引き分け
    // log：true にすると、エンジンとのやり取りを全部表示する
    // minMoveTime：1手に最低かける時間（ミリ秒）。画面で動きを見やすくするため
    constructor({ byoyomi = 1000, maxMoves = 200, log = false, minMoveTime = 0 } = {}) {
        super();
        this.log = log;
        this.minMoveTime = minMoveTime;
        this.byoyomi = byoyomi;
        this.maxMoves = maxMoves;
        this.engines = { sente: null, gote: null };
        this.placers = { sente: null, gote: null };   // 配置AI（使わない側は null）
        this.stopped = false;
    }

    // 先手・後手のエンジンを起動して、初期化する
    // config の例: { path: "./fairy-stockfish-mac", options: { RandomMove: "true" } }
    async startEngines(senteConfig, goteConfig) {

        for (const [side, config] of [["sente", senteConfig], ["gote", goteConfig]]) {
            const engine = new Engine(config.path, { log: this.log });
            engine.start();
            this.engines[side] = engine;
        }

        // 2つ同時に初期化して、両方終わるまで待つ
        await Promise.all([
            this.engines.sente.init({ ...VARIANT_OPTIONS, ...(senteConfig.options || {}) }),
            this.engines.gote.init({ ...VARIANT_OPTIONS, ...(goteConfig.options || {}) }),
        ]);
    }

    // 配置フェーズ：先手から1枚ずつ交互に、配置AIに駒を置かせる
    // 結果 { sfen: 配置が終わった局面, places: ["K*4f", "k*3a", ...] } を返す
    async placePieces() {

        // 一番手前の段（左から6マス、空きは null）と、まだ置いていない駒
        const rows = { sente: Array(6).fill(null), gote: Array(6).fill(null) };
        const remaining = { sente: [...PLACE_PIECES], gote: [...PLACE_PIECES] };
        const places = [];
        let side = "sente";

        while (remaining.sente.length > 0 || remaining.gote.length > 0) {

            if (this.stopped) return null;

            const startTime = Date.now();

            // 配置AIに次の1枚を聞く（配置AIがない・返事がおかしいときはランダム）
            let place = null;
            if (this.placers[side]) {
                try {
                    place = await this.placeWithTimeout(this.placers[side],
                        rowToSfen(rows.gote, "gote"), rowToSfen(rows.sente, "sente"), side);
                } catch (err) {
                    place = null;
                }
            }

            let random = false;
            if (!isValidPlace(place, side, rows[side], remaining[side])) {
                place = randomPlace(side, rows[side], remaining[side]);
                random = true;
            }

            // 盤に置いて、残りの駒から消す（飛か角を置いたら、もう片方も消す）
            const piece = place[0];
            const col = 6 - Number(place[2]);
            rows[side][col] = piece;
            removePiece(remaining[side], piece);

            // 記録は後手を小文字にする  例: 先手 "K*4f"、後手 "k*3a"
            places.push(side === "sente" ? place : place[0].toLowerCase() + place.slice(1));
            this.emit("place", { side, place, random, ply: places.length });

            // 画面で見やすいように、最低の時間だけ待つ
            const elapsed = Date.now() - startTime;
            if (elapsed < this.minMoveTime) {
                await new Promise(resolve => setTimeout(resolve, this.minMoveTime - elapsed));
            }

            // 相手にまだ置く駒があれば、相手の番
            if (remaining[opponent(side)].length > 0) side = opponent(side);
        }

        const sfen = `${rowToSfen(rows.gote, "gote")}/pppppp/6/6/PPPPPP/${rowToSfen(rows.sente, "sente")} b - 1`;
        return { sfen, places };
    }

    // 配置AIに配置を聞く。時間内に返ってこなければエラーにする
    placeWithTimeout(engine, goteRow, senteRow, side) {
        return Promise.race([
            engine.place(goteRow, senteRow, side),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
        ]);
    }

    // 配置AIを起動する。使わない側は null を渡す
    // 例: startPlacers("placers/build/random", null)
    startPlacers(sentePath, gotePath) {
        for (const [side, placerPath] of [["sente", sentePath], ["gote", gotePath]]) {
            if (!placerPath) continue;
            const placer = new Engine(placerPath, { log: this.log });
            placer.start();
            this.placers[side] = placer;
        }
    }

    // 1局指す。startSfen は配置が終わったあとの局面
    // 結果 { winner: "sente" | "gote" | null, reason, moves } を返す
    async playGame(startSfen) {

        const moves = [];
        let turn = startSfen.split(" ")[1] === "b" ? "sente" : "gote";
        this.stopped = false;

        // 新しい対局が始まることを、両方のエンジンに知らせる
        this.engines.sente.send("usinewgame");
        this.engines.gote.send("usinewgame");

        while (true) {

            // 途中で止められた
            if (this.stopped) {
                return this.finish(null, "中断", moves);
            }

            // 手数の上限
            if (moves.length >= this.maxMoves) {
                return this.finish(null, "手数の上限", moves);
            }

            // 今の局面を作って、手番のエンジンに考えさせる
            const position = "position sfen " + startSfen
                + (moves.length > 0 ? " moves " + moves.join(" ") : "");

            const startTime = Date.now();   // 考え始めた時刻

            let move;
            try {
                move = await this.goWithTimeout(this.engines[turn], position);
            } catch (err) {
                // 時間内に手が返ってこなかった → その側の負け
                return this.finish(opponent(turn), sideName(turn) + "の時間切れ", moves);
            }

            // 最低の時間に足りなければ、残りの時間だけ待つ
            const elapsed = Date.now() - startTime;
            if (elapsed < this.minMoveTime) {
                await new Promise(resolve => setTimeout(resolve, this.minMoveTime - elapsed));
            }

            // 投了 → その側の負け
            if (move === "resign") {
                return this.finish(opponent(turn), sideName(turn) + "の投了", moves);
            }

            // 入玉宣言 → その側の勝ち
            if (move === "win") {
                return this.finish(turn, sideName(turn) + "の入玉宣言", moves);
            }

            // 手を棋譜に追加して、相手の手番へ
            moves.push(move);
            this.emit("move", { side: turn, move, ply: moves.length });
            turn = opponent(turn);
        }
    }

    // エンジンに考えさせる。時間内に返ってこなければエラーにする
    goWithTimeout(engine, position) {
        const limit = this.byoyomi + 5000;   // 考える時間＋5秒の余裕
        return Promise.race([
            engine.go(position, this.byoyomi),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), limit)),
        ]);
    }

    // 対局の終了：結果をエンジンに伝えて、結果を返す
    finish(winner, reason, moves) {

        for (const side of ["sente", "gote"]) {
            const engine = this.engines[side];
            if (!engine || !engine.process) continue;
            const result = winner === null ? "draw" : (winner === side ? "win" : "lose");
            engine.send("gameover " + result);
        }

        const result = { winner, reason, moves };
        this.emit("end", result);
        return result;
    }

    // 先手と後手のエンジンを入れ替える（連続対局で先後を交代するため）
    swapSides() {
        [this.engines.sente, this.engines.gote] = [this.engines.gote, this.engines.sente];
        [this.placers.sente, this.placers.gote] = [this.placers.gote, this.placers.sente];
    }

    // 対局を途中で止める（次の手番で止まる）
    stopGame() {
        this.stopped = true;
    }

    // 両方のエンジンと配置AIを終了する
    stopEngines() {
        for (const side of ["sente", "gote"]) {
            if (this.engines[side]) {
                this.engines[side].stop();
                this.engines[side] = null;
            }
            if (this.placers[side]) {
                this.placers[side].stop();
                this.placers[side] = null;
            }
        }
    }
}

// 先手・後手の日本語の名前
function sideName(side) {
    return side === "sente" ? "先手" : "後手";
}

// 相手の側
function opponent(side) {
    return side === "sente" ? "gote" : "sente";
}

// =========================
// 配置フェーズで使う関数
// =========================

// 配置する駒（飛と角はどちらか片方だけ使う）
const PLACE_PIECES = ["K", "G", "S", "N", "L", "R", "B"];

// 一番手前の段を SFEN の書き方にする  例: ["L", null, "G", null, null, null] → "L1G3"（後手は小文字）
function rowToSfen(row, side) {
    let text = "";
    let empty = 0;
    for (const piece of row) {
        if (piece === null) {
            empty++;
            continue;
        }
        if (empty > 0) text += empty;
        empty = 0;
        text += side === "gote" ? piece.toLowerCase() : piece;
    }
    if (empty > 0) text += empty;
    return text;
}

// エンジンの返事が、ルールどおりの配置か調べる  例: 先手なら "K*4f"
function isValidPlace(place, side, row, remaining) {
    if (typeof place !== "string" || !/^[KGSNLRB]\*[1-6][af]$/.test(place)) return false;
    if (!remaining.includes(place[0])) return false;              // もう置いた駒
    if (place[3] !== (side === "sente" ? "f" : "a")) return false; // 自分の一番手前の段ではない
    return row[6 - Number(place[2])] === null;                     // 空いているマスか
}

// ランダムに1枚置く（エンジンが配置に対応していないときの代わり）
function randomPlace(side, row, remaining) {
    const piece = remaining[Math.floor(Math.random() * remaining.length)];
    const empties = [];
    for (let col = 0; col < 6; col++) {
        if (row[col] === null) empties.push(col);
    }
    const col = empties[Math.floor(Math.random() * empties.length)];
    return `${piece}*${6 - col}${side === "sente" ? "f" : "a"}`;
}

// 置いた駒を一覧から消す。飛か角を置いたら、もう片方も消す
function removePiece(list, piece) {
    list.splice(list.indexOf(piece), 1);
    const other = piece === "R" ? "B" : piece === "B" ? "R" : null;
    if (other && list.includes(other)) list.splice(list.indexOf(other), 1);
}

module.exports = EngineManager;
