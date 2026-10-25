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

            console.log(
                "追加:",
                match[1]
            );

            legalMoves.push(
                match[1]
            );
        }
        
        // ---- C++ の AI からの返事（例: "bestmove 2b2c"） ----
        if (line.startsWith("bestmove")) {

            // スペースで区切って2つ目を取り出す → "2b2c"
            const move = line.trim().split(" ")[1];

            console.log("C++ AI:", move);

            // 投了でなければ、盤に反映する
            if (move !== "resign") {
                applyMove(move);
            }
        }

    }

    if (
        text.includes("Nodes searched")
    ) {
        legalMovesReady = true;

        console.log(
            "合法手一覧:",
            legalMoves
        );
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