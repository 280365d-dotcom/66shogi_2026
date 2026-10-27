// =========================
// 駒辞書
// =========================
const pieceMap = {
    p: "歩",
    l: "香",
    n: "桂",
    s: "銀",
    g: "金",
    b: "角",
    r: "飛",
    k: "王"
};
const promotionMap = {

    "歩": "と",
    "香": "杏",
    "桂": "圭",
    "銀": "全",
    "角": "馬",
    "飛": "龍"

};
const demotionMap = {

    "と": "歩",
    "杏": "香",
    "圭": "桂",
    "全": "銀",
    "馬": "角",
    "龍": "飛"

};

//追加
let legalMovesReady = false;
// 対局履歴
let gameMoves = [];
//合法手取得
let legalMoves = [];
// 選択中のマス
let selectedSquare = null;
//持ち駒
let senteHand = [];
let goteHand = [];

let selectedHandPiece = null;

let gameOver = false;
// =========================
// 初期局面
// =========================

const INITIAL_SFEN =
    "6/pppppp/6/6/PPPPPP/6 w - 1";

let boardState =
    sfenToBoardState(INITIAL_SFEN);

console.log("初期盤面:", boardState);

// =========================
// 盤生成
// =========================

const board =
    document.getElementById("board");

for (let rank = 0; rank < 6; rank++) {
    for (let file = 6; file >= 1; file--) {
        const square = document.createElement("div");
        square.className = "square";
        const pos = `${file}${String.fromCharCode(97 + rank)}`;
        square.dataset.pos = pos;
        square.addEventListener("click", () => {
            const index =
                getSquareIndex(square);
            if (mode === "placement") {

                handlePlacementClick(
                    index.rank,
                    index.file
                );
            } else if (mode === "battle") {

                handleBattleClick(
                    index.rank,
                    index.file
                );
            }
            console.log("clicked:", pos);
        });
        board.appendChild(square);
    }
}
// =========================
// マス→配列index変換
// =========================
function getSquareIndex(square) {
    const pos = square.dataset.pos;

    const fileNum = parseInt(pos[0]);

    const rankChar = pos[1];
    return {
        rank:
            rankChar.charCodeAt(0) - 97,
        file:
            6 - fileNum
    };
}
// =========================
// 盤描画
// =========================
function renderPieces() {
    const squares = document.querySelectorAll(".square");
    squares.forEach((sq, index) => {
        const rank = Math.floor(index / 6);
        const file = index % 6;
        const piece = boardState[rank][file];
        if (piece === "") {
            sq.textContent = "";
            sq.classList.remove(
                "gote-piece"
            );
            return;
        }
        const pure = piece.replace(/^s_|^g_/, "");
        sq.textContent = pure;
        if (piece.startsWith("g_")) {
            sq.classList.add(
                "gote-piece"
            );
        } else {
            sq.classList.remove(
                "gote-piece"
            );
        }
    });
}

// =========================
// SFEN生成
// =========================
function rankToSFEN(rankArray) {
    let sfen = "";
    let empty = 0;
    for (let cell of rankArray) {
        if (cell === "") {
            empty++;
            continue;
        }
        if (empty > 0) {
            sfen += empty;
            empty = 0;
        }
        const isGote = cell.startsWith("g_");
        const jp = cell.replace(/^s_|^g_/, "");
        const letter =
            Object.keys(pieceMap)
                  .find(
                      key =>
                          pieceMap[key] === jp
                  );
        sfen +=
            isGote
                ? letter
                : letter.toUpperCase();
    }
    if (empty > 0) {
        sfen += empty;
    }
    return sfen;
}
function boardToSFEN(boardState) {
    return boardState
        .map(rank => rankToSFEN(rank))
        .join("/");
}

function makeSFEN(boardState, turn = "b") {
    return (
        boardToSFEN(boardState)
        + " "
        + turn
        + " - 13"
    );
}

// =========================
// SFEN → boardState
// =========================

function sfenToBoardState(sfen) {
    const [boardPart] = sfen.split(" ");
    const ranks = boardPart.split("/");
    const boardState = [];
    for (let r = 0; r < 6; r++) {
        const row = [];
        const rankStr =
            ranks[r];
        for (
            let i = 0;
            i < rankStr.length;
            i++
        ) {
            const ch =
                rankStr[i];
            if (/\d/.test(ch)) {
                const emptyCount =
                    parseInt(ch);
                for (
                    let e = 0;
                    e < emptyCount;
                    e++
                ) {
                    row.push("");
                }
            } else {
                const isGote = ch === ch.toLowerCase();
                const pieceLetter = ch.toLowerCase();
                const jp = pieceMap[pieceLetter];
                const prefix =
                    isGote
                        ? "g_"
                        : "s_";
                row.push(
                    prefix + jp
                );
            }
        }
        boardState.push(row);
    }
    return boardState;
}
// =========================
// USI → index変換
// =========================
function usiToIndex(usiSquare) {
    const fileNum = parseInt(usiSquare[0]);
    const rankChar = usiSquare[1];
    return {
        rank:
            rankChar.charCodeAt(0) - 97,
        file:
            6 - fileNum
    };
}
// =========================
// index → USI変換
// =========================
function indexToUSI(rank, file) {
    const fileNum = 6 - file;
    const rankChar = String.fromCharCode(97 + rank);
    return `${fileNum}${rankChar}`;
}

// =========================
// bestmove反映
// =========================

function applyBestmove(boardState,bestmove) {
    const from = bestmove.slice(0, 2);
    const to = bestmove.slice(2, 4);
    const fromIdx = usiToIndex(from);
    const toIdx = usiToIndex(to);
    const piece = boardState[fromIdx.rank][fromIdx.file];
    boardState[toIdx.rank][toIdx.file] = piece;
    boardState[fromIdx.rank][fromIdx.file] = "";
    return boardState;
}

// =========================
// 対局クリック
// =========================

function handleBattleClick(rank, file) {
    if (gameOver) {
        return;
    }
    if (selectedHandPiece) {
        const target = indexToUSI(rank, file);
        const pieceUSI = handPieceToUSI(selectedHandPiece);
        const dropMove = pieceUSI + "*" + target;
        console.log("駒打ち候補:", dropMove);
        // 合法手チェック
        if (!legalMoves.includes(dropMove)) {
            console.log("違法な駒打ち:", dropMove);
            selectedHandPiece = null;
            return;
        }
        // 棋譜へ追加
        gameMoves.push(dropMove);
        // 盤面へ配置
        const prefix = turn === "sente" ? "s_" : "g_";
        boardState[rank][file] = prefix + selectedHandPiece;
        // 持ち駒から削除
        if (turn === "sente") {
            const idx = senteHand.indexOf(selectedHandPiece);
            if (idx !== -1) {
                senteHand.splice(idx, 1);
            }
        } else {
            const idx = goteHand.indexOf(selectedHandPiece);
            if (idx !== -1) {
                goteHand.splice(idx, 1);
            }
        }
        renderPieces();
        renderCapturedHands();
        turn = turn === "sente" ? "gote" : "sente";
        updateLegalMoves();
        selectedHandPiece = null;
        return;
    }

    // 1回目クリック
    if (selectedSquare === null) {
        if (boardState[rank][file] === "") {
            return;
        }
        selectedSquare = {
            rank,
            file
        };
        console.log("選択:", indexToUSI(rank, file));
        return;
    }
    // 2回目クリック
    const from =indexToUSI(selectedSquare.rank,selectedSquare.file);
    const to =indexToUSI(rank,file);
    let move = from + to;
    const promoteMove = move + "+";
    if (legalMoves.includes(promoteMove)) {
        const promote = confirm("成りますか？");
        if (promote) {
            move = promoteMove;
        }
    }
    console.log("指し手:", move);
    // ---------------------
    // 合法手判定
    // ---------------------
    if (!legalMoves.includes(move)) {
        console.log("違法手:", move);
        selectedSquare = null;
        return;
    }
    // ---------------------
    // 合法なら追加
    // ---------------------
    gameMoves.push(move);
    turn = turn === "sente" ? "gote" : "sente";
    // -------------------
    // 現在局面をエンジンへ送信
    // -------------------
    const positionCommand = "position sfen " + battleStartSFEN + " moves " + gameMoves.join(" ");
    console.log(positionCommand);
    ws.send(positionCommand);
    ws.send("d");
    // GUI上で駒を動かす
    const piece = boardState[selectedSquare.rank][selectedSquare.file];
    const capturedPiece = boardState[rank][file];
    if (capturedPiece !== "") {
        let basePiece = capturedPiece.replace(/^s_|^g_/, "");
        if (demotionMap[basePiece]) {
            basePiece = demotionMap[basePiece];
        }
        if (piece.startsWith("s_")) {
            senteHand.push(basePiece);
            renderCapturedHands();
            console.log("先手持ち駒:", senteHand);
        } else {
            goteHand.push(basePiece);
            renderCapturedHands();
            console.log("後手持ち駒:", goteHand);
        }
    }
    if (move.endsWith("+")) {
        const prefix = piece.startsWith("s_") ? "s_" : "g_";
        const name = piece.replace(/^s_|^g_/, "");
        boardState[rank][file] = prefix + promotionMap[name];
    } else {
        boardState[rank][file] = piece;
    }
    boardState[selectedSquare.rank][selectedSquare.file] = "";
    renderPieces();
    selectedSquare = null;
    // 次局面の合法手取得
    updateLegalMoves();
    console.log(
        "対局履歴:",
        gameMoves
    );
}

//合法手取得
function updateLegalMoves() {
    legalMoves = [];
    legalMovesReady = false;
    const positionCommand = "position sfen " + battleStartSFEN + " moves " + gameMoves.join(" ");
    ws.send(positionCommand);
    ws.send("go perft 1");
}
function renderCapturedHands() {
    const senteArea = document.getElementById("sente-pieces");
    const goteArea = document.getElementById("gote-pieces");
    senteArea.innerHTML = "";
    goteArea.innerHTML = "";
    senteHand.forEach(piece => {
        const btn = document.createElement("button");
        btn.textContent = piece;
        btn.addEventListener("click", () => {
            selectedHandPiece = piece;
            console.log("持ち駒選択:", piece);
        });
        senteArea.appendChild(btn);
    });
    goteHand.forEach(piece => {
        const btn = document.createElement("button");
        btn.textContent = piece;
        btn.addEventListener("click", () => {
            selectedHandPiece = piece;
            console.log("持ち駒選択:", piece);
        });
        goteArea.appendChild(btn);
    });
}

function handPieceToUSI(piece) {
    switch (piece) {
        case "歩": return "P";
        case "香": return "L";
        case "桂": return "N";
        case "銀": return "S";
        case "金": return "G";
        case "飛": return "R";
        case "角": return "B";
    }

}


//ここから新しく追加
document.getElementById("reset").addEventListener("click", resetGame);

function resetGame() {
    boardState = sfenToBoardState(INITIAL_SFEN);
    placementMoves = [];
    gameMoves = [];
    legalMoves = [];
    senteHand = [];
    goteHand = [];
    turn = "sente";
    selectedSquare = null;
    selectedHandPiece = null;
    selectedPiece = null;
    mode = "placement";
    gameOver = false;
    piecesToPlace = {
        sente: [...INITIAL_PIECES_TO_PLACE.sente],
        gote: [...INITIAL_PIECES_TO_PLACE.gote]
    };

    renderPieces();
    renderHands();
    updateLegalMoves();
    console.log("初期化完了");
}

document.getElementById("resign").addEventListener("click", resignGame);

function resignGame() {
    const ok = confirm("投了しますか？");
    if (!ok) {
        return;
    }
    gameOver = true;
    alert((turn === "sente" ? "後手の勝ち！" : "先手の勝ち！"));
}


// =========================
// 指し手を盤面に反映(AIが指す時に必要)
// =========================

function applyMove(move) {

    const isSente = turn === "sente";
    const prefix = isSente ? "s_" : "g_";
    const hand = isSente ? senteHand : goteHand;

    if (move.includes("*")) {

        // 駒打ち 例: P*3d
        const pieceJP = pieceMap[move[0].toLowerCase()];
        const to = usiToIndex(move.slice(2, 4));

        boardState[to.rank][to.file] = prefix + pieceJP;

        const idx = hand.indexOf(pieceJP);
        if (idx !== -1) hand.splice(idx, 1);

    } else {

        // 盤上の移動 例: 5e5d / 2b2a+
        const from = usiToIndex(move.slice(0, 2));
        const to = usiToIndex(move.slice(2, 4));

        let piece = boardState[from.rank][from.file];
        const captured = boardState[to.rank][to.file];

        if (captured !== "") {
            let base = captured.replace(/^s_|^g_/, "");
            if (demotionMap[base]) base = demotionMap[base];
            hand.push(base);
        }

        if (move.endsWith("+")) {
            const name = piece.replace(/^s_|^g_/, "");
            piece = prefix + promotionMap[name];
        }

        boardState[to.rank][to.file] = piece;
        boardState[from.rank][from.file] = "";
    }

    gameMoves.push(move);
    turn = isSente ? "gote" : "sente";

    renderPieces();
    renderCapturedHands();
    updateLegalMoves();
}

// =========================
// 初回描画
// =========================

renderPieces();

console.log(
    "初期SFEN:",
    makeSFEN(boardState, "b")
);