// 配置履歴
let placementMoves = [];

// ----------------------------
// 初期配置フェーズ
// ----------------------------

let mode = "placement";
let selectedPiece = null;
let turn = "sente";
const INITIAL_PIECES_TO_PLACE = {
    sente: [
        "s_王",
        "s_金",
        "s_銀",
        "s_桂",
        "s_香",
        "s_飛",
        "s_角"
    ],

    gote: [
        "g_王",
        "g_金",
        "g_銀",
        "g_桂",
        "g_香",
        "g_飛",
        "g_角"
    ]
};
// 66将棋用の配置駒
let piecesToPlace = {
    sente: [...INITIAL_PIECES_TO_PLACE.sente],
    gote: [...INITIAL_PIECES_TO_PLACE.gote]
};
// ----------------------------
// 駒選択
// ----------------------------

function selectPiece(piece) {
    const side = piece.startsWith("s_") ? "sente" : "gote";
    if ((turn === "sente" && side !== "sente") || (turn === "gote" && side !== "gote")) {
        return;
    }
    selectedPiece = piece;
    console.log("選択:", piece);
}

// ----------------------------
// マスクリック
// ----------------------------

function handlePlacementClick(rank, file) {
    if (!selectedPiece) return;
    // 既に駒がある
    if (boardState[rank][file] !== "") {
        return;
    }
    // 先手は最下段(rank=5)
    if (turn === "sente" && rank !== 5) {
        return;
    }
    // 後手は最上段(rank=0)
    if (turn === "gote" && rank !== 0) {
        return;
    }
    boardState[rank][file] = selectedPiece;
    // --------------------
    // 配置履歴を記録
    // --------------------
    const move = pieceToUSI(selectedPiece) + "*" + indexToUSI(rank, file);
    placementMoves.push(move);
    console.log("配置履歴:", placementMoves);
    removePieceFromList(selectedPiece);
    selectedPiece = null;
   // 手番交代
    if (turn === "sente") {
        turn = "gote";
    } else {
        turn = "sente";
    }
    renderPieces();

    if (isPlacementFinished()) {
        let battleStartSFEN = "";
        startBattlePhase();
    }
}

// ----------------------------
// リストから削除
// ----------------------------

function removePieceFromList(piece) {
    const side = piece.startsWith("s_") ? "sente" : "gote";
    const list = piecesToPlace[side];
    const idx = list.indexOf(piece);
    if (idx !== -1) {
        list.splice(idx, 1);
    }
    // 飛車配置 → 角削除
    if (piece.endsWith("飛")) {
        const bishop = side === "sente" ? "s_角" : "g_角";
        const bidx = list.indexOf(bishop);
        if (bidx !== -1) {
            list.splice(bidx, 1);
        }
    }

    // 角配置 → 飛車削除
    if (piece.endsWith("角")) {
        const rook = side === "sente" ? "s_飛" : "g_飛";
        const ridx = list.indexOf(rook);
        if (ridx !== -1) {
            list.splice(ridx, 1);
        }
    }
    renderHands();
}
// ----------------------------
// 配置完了判定
// ----------------------------
function isPlacementFinished() {
    return (piecesToPlace.sente.length === 0 && piecesToPlace.gote.length === 0);
}
// ----------------------------
// 対局フェーズへ
// ----------------------------

function startBattlePhase() {
    mode = "battle";
    const positionCommand = "position startpos moves " + placementMoves.join(" ");
    console.log(positionCommand);
    if (typeof ws !== "undefined") {
        ws.send(positionCommand);
        ws.send("d");
    }

    battleStartSFEN = makeSFEN(boardState, turn === "sente" ? "b" : "w");
    console.log("生成SFEN:", battleStartSFEN);
    const syusei = "position sfen " + battleStartSFEN;
    ws.send(syusei);
    ws.send("d");
    console.log("対局開始");
    updateLegalMoves();
}

function renderHands() {
    const senteArea = document.getElementById("sente-pieces");
    const goteArea = document.getElementById("gote-pieces");
    senteArea.innerHTML = "";
    goteArea.innerHTML = "";
    piecesToPlace.sente.forEach(piece => {
        const btn = document.createElement("button");
        btn.textContent = piece.replace("s_", "");
        btn.addEventListener("click", () => {selectPiece(piece);});

        senteArea.appendChild(btn);
    });
    piecesToPlace.gote.forEach(piece => {
        const btn = document.createElement("button");
        btn.textContent = piece.replace("g_", "");
        btn.addEventListener("click", () => {selectPiece(piece);});
        goteArea.appendChild(btn);
    });

}

// 駒->USI文字変換
function pieceToUSI(piece) {

    const pure =
        piece.replace(/^s_|^g_/, "");

    switch (pure) {

        case "王": return "K";
        case "金": return "G";
        case "銀": return "S";
        case "桂": return "N";
        case "香": return "L";
        case "飛": return "R";
        case "角": return "B";
    }
}



// 初期表示
renderHands();
