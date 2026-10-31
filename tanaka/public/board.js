// =========================
// 盤面を覚えておいて、画面に描く
// =========================

// 駒の表示名
const PIECE_NAME = { P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "玉" };
const PROMOTED_NAME = { P: "と", L: "杏", N: "圭", S: "全", B: "馬", R: "龍" };

// 持ち駒を並べる順番
const HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];

// 段の名前
const RANK_NAME = ["一", "二", "三", "四", "五", "六"];

class Board {

    // 局面（SFEN）から盤面を作る
    // 例: "lsgkbn/pppppp/6/6/PPPPPP/NBKGSL b - 1"
    constructor(sfen) {

        // cells[段][列]（段 0 = 一段目、列 0 = 6筋）
        // 駒は { type: "P", side: "sente", promoted: false }、空きは null
        this.cells = [];
        this.hands = { sente: {}, gote: {} };
        this.lastMove = null;   // 最後に動いたマス（色を付けるため）

        const rows = sfen.split(" ")[0].split("/");

        for (const row of rows) {
            const cells = [];
            let promoted = false;
            for (const ch of row) {
                if (/\d/.test(ch)) {
                    for (let i = 0; i < Number(ch); i++) cells.push(null);   // 数字は空きマスの数
                } else if (ch === "+") {
                    promoted = true;                                          // 次の駒は成っている
                } else {
                    cells.push({
                        type: ch.toUpperCase(),
                        side: ch === ch.toUpperCase() ? "sente" : "gote",     // 大文字が先手
                        promoted,
                    });
                    promoted = false;
                }
            }
            this.cells.push(cells);
        }
    }

    // "3e" → { rank: 4, col: 3 }
    static toIndex(square) {
        return { rank: square.charCodeAt(1) - 97, col: 6 - Number(square[0]) };
    }

    // "3e" → "3四"
    static squareName(square) {
        return square[0] + RANK_NAME[square.charCodeAt(1) - 97];
    }

    // エンジンの手を盤面に反映して、棋譜の文字を返す
    // 例: "3e3d" → "3四歩(3五)"、"2c2b+" → "2二歩成(2三)"、"P*3c" → "3三歩打"
    apply(move, side) {

        // 駒打ち：持ち駒を1枚減らして、盤に置く
        if (move.includes("*")) {
            const type = move[0];
            const to = Board.toIndex(move.slice(2, 4));
            this.hands[side][type]--;
            this.cells[to.rank][to.col] = { type, side, promoted: false };
            this.lastMove = to;
            return Board.squareName(move.slice(2, 4)) + PIECE_NAME[type] + "打";
        }

        // 盤上の駒を動かす
        const from = Board.toIndex(move.slice(0, 2));
        const to = Board.toIndex(move.slice(2, 4));
        const piece = this.cells[from.rank][from.col];
        const captured = this.cells[to.rank][to.col];

        // 棋譜用の駒の名前（動かす前の名前）
        const name = piece.promoted ? PROMOTED_NAME[piece.type] : PIECE_NAME[piece.type];

        // 相手の駒があれば取って、持ち駒にする（成っていても元の駒に戻る）
        if (captured) {
            this.hands[side][captured.type] = (this.hands[side][captured.type] || 0) + 1;
        }

        const promote = move.endsWith("+");
        if (promote) {
            piece.promoted = true;
        }

        this.cells[to.rank][to.col] = piece;
        this.cells[from.rank][from.col] = null;
        this.lastMove = to;

        return Board.squareName(move.slice(2, 4)) + name + (promote ? "成" : "")
             + "(" + Board.squareName(move.slice(0, 2)) + ")";
    }

    // 盤と持ち駒を画面に描く
    // onCellClick：マスがクリックされたときに呼ぶ関数（配置のときに使う）
    // drawHands：false にすると持ち駒を描かない（配置のときは別のものを表示するため）
    render(boardElement, senteHandElement, goteHandElement, { onCellClick = null, drawHands = true } = {}) {

        boardElement.innerHTML = "";

        // 1行目：筋の番号（6 5 4 3 2 1）
        for (let col = 0; col < 6; col++) {
            boardElement.appendChild(makeDiv("label", String(6 - col)));
        }
        boardElement.appendChild(makeDiv("label", ""));

        // 2行目から：マスと段の名前
        for (let rank = 0; rank < 6; rank++) {
            for (let col = 0; col < 6; col++) {

                const cell = makeDiv("cell", "");
                const piece = this.cells[rank][col];

                if (onCellClick) {
                    cell.classList.add("clickable");
                    cell.addEventListener("click", () => onCellClick(rank, col));
                }

                if (this.lastMove && this.lastMove.rank === rank && this.lastMove.col === col) {
                    cell.classList.add("last");
                }

                if (piece) {
                    const name = piece.promoted ? PROMOTED_NAME[piece.type] : PIECE_NAME[piece.type];
                    const span = makeDiv("", piece.type === "K" && piece.side === "gote" ? "王" : name);
                    if (piece.side === "gote") span.classList.add("gote");
                    if (piece.promoted) span.classList.add("promoted");
                    cell.appendChild(span);
                }

                boardElement.appendChild(cell);
            }
            boardElement.appendChild(makeDiv("label", RANK_NAME[rank]));
        }

        // 持ち駒：駒の形のタイルで並べる
        if (drawHands) {
            renderHand(senteHandElement, this.hands.sente);
            renderHand(goteHandElement, this.hands.gote);
        }
    }

    // 今の盤面を SFEN にする（持ち駒なし・先手番）
    // 例: "lsgkbn/pppppp/6/6/PPPPPP/NBKGSL b - 1"
    toSfen() {
        const rows = this.cells.map(cells => {
            let text = "";
            let empty = 0;
            for (const piece of cells) {
                if (!piece) {
                    empty++;
                    continue;
                }
                if (empty > 0) {
                    text += empty;
                    empty = 0;
                }
                const letter = piece.side === "sente" ? piece.type : piece.type.toLowerCase();
                text += (piece.promoted ? "+" : "") + letter;
            }
            if (empty > 0) text += empty;
            return text;
        });
        return rows.join("/") + " b - 1";
    }
}

// div を作る小さな関数
function makeDiv(className, text) {
    const div = document.createElement("div");
    if (className) div.className = className;
    div.textContent = text;
    return div;
}

// 持ち駒をタイルで並べる  例: { R: 1, P: 2 } → [飛] [歩²]
function renderHand(element, hand) {

    element.innerHTML = "";

    for (const type of HAND_ORDER) {
        const count = hand[type] || 0;
        if (count === 0) continue;

        const tile = makeDiv("hand-piece", PIECE_NAME[type]);

        // 2枚以上なら、右下に枚数を出す
        if (count > 1) {
            tile.appendChild(makeDiv("count", String(count)));
        }

        element.appendChild(tile);
    }

    if (element.children.length === 0) {
        element.appendChild(makeDiv("empty", "なし"));
    }
}
