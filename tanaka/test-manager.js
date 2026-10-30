const EngineManager = require("./engineManager");

// ---- 対局の設定 ----
const SENTE = { name: "ランダムAI",             path: "./fairy-stockfish-mac", options: { RandomMove: "true" } };
const GOTE  = { name: "Fairy-Stockfish（本気）", path: "./fairy-stockfish-mac", options: { RandomMove: "false" } };
const START_SFEN = "lsgkbn/pppppp/6/6/PPPPPP/NBKGSL b - 1";   // 配置が終わったあとの局面
const BYOYOMI = 300;      // 1手に考える時間（ミリ秒）
const MAX_MOVES = 200;    // この手数で引き分け

// ---- 手を読みやすい形にする ----
const RANK = { a: "一", b: "二", c: "三", d: "四", e: "五", f: "六" };

// 駒の名前（成った駒は "+" 付き）
const PIECE_NAME = {
    P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "玉",
    "+P": "と", "+L": "成香", "+N": "成桂", "+S": "成銀", "+B": "馬", "+R": "龍",
};

// "3e" → "3五"
function square(usi) {
    return usi[0] + RANK[usi[1]];
}

// =========================
// 盤面を覚えておいて、どの駒が動いたかを調べる
// =========================
class Board {

    // 配置が終わったあとの局面（SFEN）から盤面を作る
    constructor(sfen) {
        this.cells = {};   // 例: { "3e": "P", "2a": "+r" }（大文字が先手、小文字が後手）
        const rows = sfen.split(" ")[0].split("/");
        rows.forEach((row, r) => {
            const rank = "abcdef"[r];
            let file = 6;                   // 左端は6筋
            for (let i = 0; i < row.length; i++) {
                const ch = row[i];
                if (/\d/.test(ch)) {
                    file -= Number(ch);     // 数字は空きマスの数
                } else if (ch === "+") {
                    this.cells[file + rank] = "+" + row[++i];   // 成った駒
                    file--;
                } else {
                    this.cells[file + rank] = ch;
                    file--;
                }
            }
        });
    }

    // 手を盤面に反映して、棋譜用の文字列を返す
    // 例: "3e3d" → "3四歩(3五)"、"P*3c" → "3三歩打"、"2c2b+" → "2二歩成(2三)"
    apply(move, side) {

        // 駒打ち
        if (move.includes("*")) {
            const piece = move[0];
            const to = move.slice(2, 4);
            this.cells[to] = side === "sente" ? piece : piece.toLowerCase();
            return square(to) + PIECE_NAME[piece] + "打";
        }

        // 盤上の駒を動かす
        const from = move.slice(0, 2);
        const to = move.slice(2, 4);
        const promote = move.endsWith("+");

        const piece = this.cells[from];
        const name = PIECE_NAME[piece.toUpperCase()];

        this.cells[to] = promote ? "+" + piece : piece;   // 取った駒は上書きで消える
        delete this.cells[from];

        return square(to) + name + (promote ? "成" : "") + "(" + square(from) + ")";
    }
}

// ---- 対局 ----
async function main() {

    const line = "=".repeat(40);

    console.log(line);
    console.log(" 66将棋 対局");
    console.log(" 先手 ▲ " + SENTE.name);
    console.log(" 後手 △ " + GOTE.name);
    console.log(` 秒読み ${BYOYOMI / 1000}秒 ／ 上限 ${MAX_MOVES}手`);
    console.log(line);

    const manager = new EngineManager({ byoyomi: BYOYOMI, maxMoves: MAX_MOVES });

    // 盤面を覚えておく（駒の名前を調べるため）
    const board = new Board(START_SFEN);

    // 1手ごとに表示する（先手・後手を1行に並べる）
    let row = "";
    manager.on("move", ({ side, move, ply }) => {
        const mark = side === "sente" ? "▲" : "△";
        const text = `${String(ply).padStart(3)}. ${mark}${board.apply(move, side)}`;
        if (side === "sente") {
            row = text.padEnd(22);
        } else {
            console.log(row + text);
            row = "";
        }
    });

    await manager.startEngines(SENTE, GOTE);
    const result = await manager.playGame(START_SFEN);

    if (row) console.log(row);   // 先手の手で終わったときの残り

    const winner = result.winner === "sente" ? "先手 ▲ " + SENTE.name
                 : result.winner === "gote"  ? "後手 △ " + GOTE.name
                 : "なし（引き分け）";

    console.log("-".repeat(40));
    console.log(" 勝ち　" + winner);
    console.log(" 理由　" + result.reason);
    console.log(" 手数　" + result.moves.length + "手");
    console.log(line);

    manager.stopEngines();
}

main();
