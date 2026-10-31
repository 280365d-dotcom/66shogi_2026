// =========================
// 配置フェーズ
// =========================

// 配置する前の局面（歩だけが並んでいる）
const PLACEMENT_START_SFEN = "6/pppppp/6/6/PPPPPP/6 b - 1";

// 配置する駒（飛と角はどちらか片方だけ使う）
const PLACE_PIECES = ["K", "G", "S", "N", "L", "R", "B"];

// 置ける段：先手は六段目（5）、後手は一段目（0）
const PLACE_RANK = { sente: 5, gote: 0 };

class Placement {

    constructor() {
        this.reset();
    }

    // 最初からやり直す
    reset() {
        this.board = new Board(PLACEMENT_START_SFEN);
        this.remaining = { sente: [...PLACE_PIECES], gote: [...PLACE_PIECES] };   // まだ置いていない駒
        this.selected = null;   // 選んでいる駒  例: { side: "sente", type: "K" }
    }

    // 置く駒を選ぶ（もう一度同じ駒を押したら選択を外す）
    select(side, type) {
        if (this.selected && this.selected.side === side && this.selected.type === type) {
            this.selected = null;
        } else {
            this.selected = { side, type };
        }
    }

    // 選んでいる駒を、クリックしたマスに置く。置けたら true
    placeAt(rank, col) {

        if (!this.selected) return false;

        const { side, type } = this.selected;

        // 自分の一番手前の段で、空いているマスにだけ置ける
        if (rank !== PLACE_RANK[side]) return false;
        if (this.board.cells[rank][col]) return false;

        this.put(side, type, col);
        this.selected = null;
        return true;
    }

    // 盤に置いて、残りの駒の一覧から消す
    put(side, type, col) {

        this.board.cells[PLACE_RANK[side]][col] = { type, side, promoted: false };

        const list = this.remaining[side];
        list.splice(list.indexOf(type), 1);

        // 飛を置いたら角を、角を置いたら飛を、一覧から消す
        const other = type === "R" ? "B" : type === "B" ? "R" : null;
        if (other && list.includes(other)) {
            list.splice(list.indexOf(other), 1);
        }
    }

    // 残りの駒を、空いているマスにランダムに置く
    randomFill() {
        for (const side of ["sente", "gote"]) {
            while (this.remaining[side].length > 0) {
                const list = this.remaining[side];
                const type = list[Math.floor(Math.random() * list.length)];

                const rank = PLACE_RANK[side];
                const emptyCols = [];
                for (let col = 0; col < 6; col++) {
                    if (!this.board.cells[rank][col]) emptyCols.push(col);
                }
                const col = emptyCols[Math.floor(Math.random() * emptyCols.length)];

                this.put(side, type, col);
            }
        }
        this.selected = null;
    }

    // 両方とも置き終わったか
    isComplete() {
        return this.remaining.sente.length === 0 && this.remaining.gote.length === 0;
    }
}
