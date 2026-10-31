// =========================
// サーバーとつなぐ
// =========================

// 画面を開いたのと同じサーバーにつなぐ（http://localhost:8080 なら ws://localhost:8080）
const ws = new WebSocket("ws://" + location.host);

// サーバーに送る
function send(data) {
    ws.send(JSON.stringify(data));
}

// 画面の部品
const senteSelect = document.getElementById("sente-engine");
const goteSelect = document.getElementById("gote-engine");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const statusText = document.getElementById("status");
const boardElement = document.getElementById("board");
const senteHandElement = document.getElementById("sente-hand");
const goteHandElement = document.getElementById("gote-hand");
const kifuList = document.getElementById("kifu");

// 今表示している盤面
let board = null;

// 盤を描き直す
function drawBoard() {
    board.render(boardElement, senteHandElement, goteHandElement);
}

// =========================
// サーバーから届いたものを処理する
// =========================
ws.onmessage = e => {

    const data = JSON.parse(e.data);

    // エンジンの一覧 → メニューを作る
    if (data.type === "engines") {
        for (const select of [senteSelect, goteSelect]) {
            select.innerHTML = "";
            data.list.forEach((name, index) => {
                const option = document.createElement("option");
                option.value = index;
                option.textContent = name;
                select.appendChild(option);
            });
        }
        statusText.textContent = "エンジンを選んで「対局開始」を押してください";
    }

    // 対局が始まった → 開始局面の盤を作って描く
    if (data.type === "started") {
        board = new Board(data.sfen);
        drawBoard();
        kifuList.innerHTML = "";
        statusText.textContent = `対局中：先手 ${data.sente} ／ 後手 ${data.gote}`;
    }

    // 1手指された → 盤面に反映して描き直し、棋譜に追加する
    if (data.type === "move") {
        const text = board.apply(data.move, data.side);
        drawBoard();
        addKifu((data.side === "sente" ? "▲" : "△") + text);
    }

    // 終局
    if (data.type === "end") {
        const winner = data.winner === "sente" ? "先手の勝ち"
                     : data.winner === "gote"  ? "後手の勝ち"
                     : "引き分け";
        statusText.textContent = `終局：${winner}（${data.reason}、${data.moves.length}手）`;
    }

    if (data.type === "error") {
        alert(data.message);
    }
};

// 棋譜に1手追加して、一番下までスクロールする
function addKifu(text) {
    const previous = kifuList.querySelector(".latest");
    if (previous) previous.classList.remove("latest");

    const item = document.createElement("li");
    item.textContent = text;
    item.classList.add("latest");
    kifuList.appendChild(item);

    kifuList.scrollTop = kifuList.scrollHeight;
}

ws.onclose = () => {
    statusText.textContent = "サーバーとの接続が切れました";
};

// =========================
// ボタン
// =========================
startButton.addEventListener("click", () => {
    send({ type: "start", sente: Number(senteSelect.value), gote: Number(goteSelect.value) });
});

stopButton.addEventListener("click", () => {
    send({ type: "stop" });
});

// 最初は、まだ対局していない初期局面を表示しておく
board = new Board("lsgkbn/pppppp/6/6/PPPPPP/NBKGSL b - 1");
drawBoard();
