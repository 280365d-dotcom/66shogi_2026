console.log("engine.js loaded");

const ws =
    new WebSocket(
        "ws://localhost:8080"
    );

ws.onopen = () => {
    console.log("connected");
    ws.send("usi");
};

ws.onerror = () => {
    console.log("socket error");
};

ws.onmessage = e => {

    const text = e.data;

    console.log(text);

    // ---- 合法手解析 ----

    const lines = text.split("\n");

    for (const line of lines) {

        const match =
            line.trim().match(
                /^([A-Za-z0-9*+]+):\s*1$/
            );

        if (match) {
            legalMoves.push(
                match[1]
            );
        }
    }

    if (text.includes("Nodes searched")) {
        console.log(
            "合法手一覧:",
            legalMoves
        );
        if (legalMoves.length === 0) {
            alert((turn === "sente" ? "後手" : "先手") + "の勝ち！");
        }
    }

    //初期化
    if (text.includes("usiok")) {

        ws.send(
            "setoption name VariantPath value 66shogi.ini"
        );

        ws.send(
            "setoption name USI_Variant value 66shogi"
        );

        ws.send("isready");

        ws.send("position startpos");
        ws.send("d");
    }

    if (text.includes("readyok")) {

        console.log(
            "66将棋エンジン準備完了"
        );
    }
};