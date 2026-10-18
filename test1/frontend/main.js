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


// 対局履歴
let gameMoves = [];
//合法手取得
let legalMoves = [];
// 選択中のマス
let selectedSquare = null;


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

        const square =
            document.createElement("div");

        square.className = "square";

        const pos =
            `${file}${String.fromCharCode(97 + rank)}`;

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

    const pos =
        square.dataset.pos;

    const fileNum =
        parseInt(pos[0]);

    const rankChar =
        pos[1];

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

    const squares =
        document.querySelectorAll(".square");

    squares.forEach((sq, index) => {

        const rank =
            Math.floor(index / 6);

        const file =
            index % 6;

        const piece =
            boardState[rank][file];

        if (piece === "") {

            sq.textContent = "";

            sq.classList.remove(
                "gote-piece"
            );

            return;
        }

        const pure =
            piece.replace(/^s_|^g_/, "");

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

        const isGote =
            cell.startsWith("g_");

        const jp =
            cell.replace(/^s_|^g_/, "");

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
        + " - 1"
    );
}

// =========================
// SFEN → boardState
// =========================

function sfenToBoardState(sfen) {

    const [boardPart] =
        sfen.split(" ");

    const ranks =
        boardPart.split("/");

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

                const isGote =
                    ch === ch.toLowerCase();

                const pieceLetter =
                    ch.toLowerCase();

                const jp =
                    pieceMap[pieceLetter];

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

    const fileNum =
        parseInt(usiSquare[0]);

    const rankChar =
        usiSquare[1];

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

    const rankChar =
        String.fromCharCode(97 + rank);

    return `${fileNum}${rankChar}`;
}

// =========================
// bestmove反映
// =========================

function applyBestmove(
    boardState,
    bestmove
) {

    const from =
        bestmove.slice(0, 2);

    const to =
        bestmove.slice(2, 4);

    const fromIdx =
        usiToIndex(from);

    const toIdx =
        usiToIndex(to);

    const piece =
        boardState[
            fromIdx.rank
        ][
            fromIdx.file
        ];

    boardState[
        toIdx.rank
    ][
        toIdx.file
    ] = piece;

    boardState[
        fromIdx.rank
    ][
        fromIdx.file
    ] = "";

    return boardState;
}

// =========================
// 対局クリック
// =========================

function handleBattleClick(rank, file) {

    // 1回目クリック
    if (selectedSquare === null) {

        if (boardState[rank][file] === "") {
            return;
        }

        selectedSquare = {
            rank,
            file
        };

        console.log(
            "選択:",
            indexToUSI(rank, file)
        );

        return;
    }

    // 2回目クリック

    const from =
        indexToUSI(
            selectedSquare.rank,
            selectedSquare.file
        );

    const to =
        indexToUSI(
            rank,
            file
        );

    const move =
        from + to;

    console.log(
        "指し手:",
        move
    );

    // ---------------------
    // 合法手判定
    // ---------------------

    if (!legalMoves.includes(move)) {

        console.log(
            "違法手:",
            move
        );

        selectedSquare = null;

        return;
    }

    // ---------------------
    // 合法なら追加
    // ---------------------

    gameMoves.push(move);

    // -------------------
    // 現在局面をエンジンへ送信
    // -------------------

    const positionCommand =
        "position startpos moves "
        + placementMoves
            .concat(gameMoves)
            .join(" ");

    console.log(positionCommand);

    ws.send(positionCommand);
    ws.send("d");


    // GUI上で駒を動かす

    boardState[rank][file] =
        boardState[
            selectedSquare.rank
        ][
            selectedSquare.file
        ];

    boardState[
        selectedSquare.rank
    ][
        selectedSquare.file
    ] = "";

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

    const positionCommand =
        "position startpos moves "
        + placementMoves
            .concat(gameMoves)
            .join(" ");

    ws.send(positionCommand);

    ws.send("go perft 1");
}

// =========================
// 初回描画
// =========================

renderPieces();

console.log(
    "初期SFEN:",
    makeSFEN(boardState, "b")
);