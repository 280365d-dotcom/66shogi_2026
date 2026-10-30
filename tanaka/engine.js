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
            line.trim().match(/^([A-Za-z0-9*+]+):\s*1$/);

        if (match) {
            legalMoves.push(match[1]);
        }
        // ---- C++ の AI からの返事（例: "bestmove 2b2c"） ----
        if (line.startsWith("bestmove")) {

            // スペースで区切って2つ目を取り出す → "2b2c"
            const move = line.trim().split(" ")[1];

            console.log("AIの手:", move);

            // 投了なら何もしない
            if (move == "resign") {
                continue;
            }

            // 今の局面で指せない手なら、反映しない（局面がズレてるサイン）
            if (!legalMoves.includes(move)) {
                console.error("AI が今の局面で指せない手を返しました:", move);
                legalMovesReady = true;   // もう一度押せるように戻す
                continue;
            }

            applyMove(move);
        }
    }



    if (text.includes("Nodes searched")) {
        legalMovesReady = true;
        console.log("合法手一覧:", legalMoves);
        if (legalMoves.length === 0) {
            alert((turn === "sente" ? "後手" : "先手") + "の勝ち！");
        }
        if (mode === "battle" && !gameOver && turn === aiSide) {
            setTimeout(askAI, 300);
        }
    }

    //初期化
    if (text.includes("usiok")) {
        ws.send("setoption name VariantPath value 66shogi.ini");
        ws.send("setoption name USI_Variant value 66shogi");
        ws.send("setoption name RandomMove value true"); // 追加
        ws.send("isready");
        ws.send("position startpos");
        ws.send("d");
    }

    if (text.includes("readyok")) {
        console.log("66将棋エンジン準備完了");
    }
};