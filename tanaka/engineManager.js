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
    }

    // 対局を途中で止める（次の手番で止まる）
    stopGame() {
        this.stopped = true;
    }

    // 両方のエンジンを終了する
    stopEngines() {
        for (const side of ["sente", "gote"]) {
            if (this.engines[side]) {
                this.engines[side].stop();
                this.engines[side] = null;
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

module.exports = EngineManager;
