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
const senteOptions = document.getElementById("sente-options");
const goteOptions = document.getElementById("gote-options");
const refreshButton = document.getElementById("refresh-button");
const randomButton = document.getElementById("random-button");
const resetButton = document.getElementById("reset-button");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const statusText = document.getElementById("status");
const boardElement = document.getElementById("board");
const senteHandElement = document.getElementById("sente-hand");
const goteHandElement = document.getElementById("gote-hand");
const senteHandTitle = document.getElementById("sente-hand-title");
const goteHandTitle = document.getElementById("gote-hand-title");
const kifuList = document.getElementById("kifu");
const gamesInput = document.getElementById("games");
const swapInput = document.getElementById("swap");
const randomEachInput = document.getElementById("random-each");
const byoyomiInput = document.getElementById("byoyomi");
const minTimeInput = document.getElementById("min-time");
const summaryText = document.getElementById("summary");
const resultsBody = document.getElementById("results-body");

// 今の状態："placement"（配置中）/ "playing"（対局中）/ "ended"（終局）
let mode = "placement";

// 配置フェーズ
const placement = new Placement();

// 対局中の盤面
let board = null;

// engines フォルダにあるエンジンの一覧（サーバーから届く）
let engineList = [];

// 画面に出さないオプション（66将棋の設定やファイルの場所など、GUI が自動で決めるもの）
const HIDDEN_OPTIONS = ["VariantPath", "USI_Variant", "Debug_Log_File", "EvalFile", "SyzygyPath"];

// =========================
// エンジンのオプション
// =========================

// 選んでいるエンジンのオプションを、入力欄として並べる
// check → チェックボックス、spin → 数字、combo → 選択肢
function renderOptions(select, element) {

    element.innerHTML = "";
    const engine = engineList.find(e => e.file === select.value);
    if (!engine) return;

    for (const option of engine.options) {

        if (HIDDEN_OPTIONS.includes(option.name)) continue;
        if (!["check", "spin", "combo"].includes(option.type)) continue;

        const label = document.createElement("label");
        label.textContent = option.name;

        let input;
        if (option.type === "check") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.checked = option.default === "true";
        } else if (option.type === "spin") {
            input = document.createElement("input");
            input.type = "number";
            input.value = option.default;
            if (option.min !== null) input.min = option.min;
            if (option.max !== null) input.max = option.max;
        } else {
            input = document.createElement("select");
            for (const value of option.vars) {
                const item = document.createElement("option");
                item.value = value;
                item.textContent = value;
                input.appendChild(item);
            }
            input.value = option.default;
        }

        input.dataset.name = option.name;
        input.dataset.default = option.default;
        label.appendChild(input);
        element.appendChild(label);
    }

    if (element.children.length === 0) {
        element.textContent = "変更できるオプションはありません";
    }
}

// 入力欄から、最初の値から変えたオプションだけを集める
// 例: { RandomMove: "true", Skill_Level: "5" }
function readOptions(element) {
    const options = {};
    for (const input of element.querySelectorAll("[data-name]")) {
        const value = input.type === "checkbox" ? String(input.checked) : String(input.value);
        if (value !== input.dataset.default) {
            options[input.dataset.name] = value;
        }
    }
    return options;
}

// =========================
// 画面を描く
// =========================
function draw() {

    if (mode === "placement") {
        // 配置中：盤をクリックできるようにして、持ち駒の欄には「置く駒」を出す
        placement.board.render(boardElement, senteHandElement, goteHandElement, {
            onCellClick: onPlacementClick,
            drawHands: false,
        });
        senteHandTitle.textContent = "▲先手の置く駒";
        goteHandTitle.textContent = "△後手の置く駒";
        renderPlacePieces(senteHandElement, "sente");
        renderPlacePieces(goteHandElement, "gote");

        statusText.textContent = placement.isComplete()
            ? "配置が終わりました。エンジンを選んで「対局開始」を押してください"
            : "置く駒を選んでから、自分の一番手前の段をクリックしてください（飛と角はどちらか片方）";
    } else {
        // 対局中・終局：盤と持ち駒を表示する
        board.render(boardElement, senteHandElement, goteHandElement);
        senteHandTitle.textContent = "▲先手の持ち駒";
        goteHandTitle.textContent = "△後手の持ち駒";
    }

    // ボタンを押せるかどうか
    randomButton.disabled = mode !== "placement" || placement.isComplete();
    resetButton.disabled = mode === "playing";
    refreshButton.disabled = mode === "playing";
    senteSelect.disabled = mode === "playing";
    goteSelect.disabled = mode === "playing";
    // 1局ごとにランダムに配置するなら、自分で配置していなくても始められる
    startButton.disabled = mode !== "placement" || !(placement.isComplete() || randomEachInput.checked);
    for (const input of [gamesInput, swapInput, randomEachInput, byoyomiInput, minTimeInput]) {
        input.disabled = mode === "playing";
    }
    stopButton.disabled = mode !== "playing";
}

// 配置中の「置く駒」をタイルで並べる。クリックで選ぶ
function renderPlacePieces(element, side) {

    element.innerHTML = "";

    for (const type of placement.remaining[side]) {
        const tile = makeDiv("hand-piece", side === "gote" && type === "K" ? "王" : PIECE_NAME[type]);
        tile.classList.add("selectable");
        if (side === "gote") tile.classList.add("gote-piece");

        if (placement.selected && placement.selected.side === side && placement.selected.type === type) {
            tile.classList.add("selected");
        }

        tile.addEventListener("click", () => {
            placement.select(side, type);
            draw();
        });

        element.appendChild(tile);
    }

    if (element.children.length === 0) {
        element.appendChild(makeDiv("empty", "置き終わりました"));
    }
}

// 配置中に盤のマスがクリックされた
function onPlacementClick(rank, col) {
    if (placement.placeAt(rank, col)) {
        draw();
    }
}

// =========================
// サーバーから届いたものを処理する
// =========================
ws.onmessage = e => {

    const data = JSON.parse(e.data);

    // エンジンの一覧 → メニューを作る
    if (data.type === "engines") {
        engineList = data.list;
        for (const [select, optionsElement] of [[senteSelect, senteOptions], [goteSelect, goteOptions]]) {
            const before = select.value;   // 更新前に選んでいたもの
            select.innerHTML = "";
            for (const engine of engineList) {
                const option = document.createElement("option");
                option.value = engine.file;
                option.textContent = `${engine.name}（${engine.file}）`;
                select.appendChild(option);
            }
            if (engineList.some(e => e.file === before)) select.value = before;
            renderOptions(select, optionsElement);
        }
        if (engineList.length === 0) {
            alert("engines フォルダにエンジンがありません");
        }
        draw();
    }

    // 1局が始まった → その局の開始局面から盤を作る
    if (data.type === "started") {
        mode = "playing";
        board = new Board(data.sfen);
        kifuList.innerHTML = "";
        draw();
        statusText.textContent = `第${data.game}局／${data.total}局　対局中：先手 ${data.sente} ／ 後手 ${data.gote}`;
    }

    // 1手指された → 盤面に反映して描き直し、棋譜に追加する
    if (data.type === "move") {
        const text = board.apply(data.move, data.side);
        draw();
        addKifu((data.side === "sente" ? "▲" : "△") + text);
    }

    // 1局終わった → 結果の表に1行追加する
    if (data.type === "end") {
        addResult(data);
    }

    // 全部の対局が終わった → 集計を表示する
    if (data.type === "series-end") {
        mode = "ended";
        draw();
        const s = data.summary;
        const rate = n => s.games > 0 ? Math.round(n / s.games * 100) : 0;
        summaryText.textContent =
            `${s.games}局　A: ${s.nameA} ${s.A}勝（${rate(s.A)}%）／ B: ${s.nameB} ${s.B}勝（${rate(s.B)}%）／ 引き分け ${s.draw}`
            + `　平均 ${s.games > 0 ? Math.round(s.totalMoves / s.games) : 0}手`;
        statusText.textContent = `全${s.games}局が終わりました。結果は ${data.file} に保存しました`;
    }

    if (data.type === "error") {
        alert(data.message);
    }
};

// 対局結果の表に1行追加する
function addResult(data) {
    const row = document.createElement("tr");
    const winner = data.winner ? data.winner : "引き分け";
    for (const text of [data.game, data.sente, data.gote, winner, data.reason, data.moves]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.appendChild(cell);
    }
    // 勝った側の欄を太字にする
    if (data.winnerSide === "sente") row.children[1].classList.add("win");
    if (data.winnerSide === "gote") row.children[2].classList.add("win");
    resultsBody.appendChild(row);
}

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
randomButton.addEventListener("click", () => {
    placement.randomFill();
    draw();
});

resetButton.addEventListener("click", () => {
    placement.reset();
    kifuList.innerHTML = "";
    mode = "placement";
    draw();
});

startButton.addEventListener("click", () => {
    send({
        type: "start",
        sente: { file: senteSelect.value, options: readOptions(senteOptions) },
        gote: { file: goteSelect.value, options: readOptions(goteOptions) },
        sfen: placement.board.toSfen(),   // 配置した局面から対局する
        games: Number(gamesInput.value),
        swap: swapInput.checked,
        randomPlacement: randomEachInput.checked,
        byoyomi: Math.round(Number(byoyomiInput.value) * 1000),
        minMoveTime: Math.round(Number(minTimeInput.value) * 1000),
    });
    // 新しく始めるときは、前の結果を消す
    resultsBody.innerHTML = "";
    summaryText.textContent = "対局中…";
});

// 「ランダムに配置する」を切り替えたら、対局開始ボタンを押せるか更新する
randomEachInput.addEventListener("change", draw);

refreshButton.addEventListener("click", () => {
    send({ type: "refresh" });
});

// エンジンを選び直したら、そのエンジンのオプションを出し直す
senteSelect.addEventListener("change", () => renderOptions(senteSelect, senteOptions));
goteSelect.addEventListener("change", () => renderOptions(goteSelect, goteOptions));

stopButton.addEventListener("click", () => {
    send({ type: "stop" });
});

// 最初の表示
draw();
