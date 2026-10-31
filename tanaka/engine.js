const { spawn } = require("child_process");

class Engine {

    // log を true にすると、エンジンとのやり取りを全部表示する
    constructor(enginePath, { log = false } = {}) {
        this.path = enginePath;
        this.log = log;
        this.process = null;
        this.buffer = "";          // 途中で切れた行を溜めておく場所
        this.listeners = [];       // 1行届くたびに呼ぶ関数の一覧
    }

    // 実行プログラム（process）の起動
    start() {
        this.process = spawn(this.path);

        this.process.stdout.on("data", (data) => {
            // 届いた分を溜めて、改行までそろった行だけ処理する
            this.buffer += data.toString();
            const lines = this.buffer.split("\n");
            this.buffer = lines.pop();                 // 最後の未完成の行は次回へ
            for (const raw of lines) {
                const line = raw.trim();               // Windows の \r も取り除く
                if (line === "") continue;
                if (this.log) console.log("[ENGINE]", line);
                for (const listener of [...this.listeners]) {
                    listener(line);
                }
            }
        });

        this.process.stderr.on("data", (data) => {
            console.error("[ERROR]", data.toString());
        });

        // 起動できなかったときに、書き込みのエラーでプログラム全体が止まらないようにする
        this.process.stdin.on("error", () => {});

        this.process.on("error", (err) => {
            console.error("エンジンを起動できません:", err.message);
        });

        this.process.on("exit", (code) => {
            if (this.log) console.log(`Engine Exit : ${code}`);
            this.process = null;
        });
    }

    // 実行プログラム（process）に対して command の文字列を送信する
    send(command) {
        if (this.log) console.log("[SEND]", command);
        this.process.stdin.write(command + "\n");
    }

    // 条件に合う行が届くまで待つ  例: await this.waitFor(line => line === "usiok")
    waitFor(match) {
        return new Promise((resolve) => {
            const listener = (line) => {
                if (match(line)) {
                    this.listeners = this.listeners.filter(l => l !== listener);
                    resolve(line);
                }
            };
            this.listeners.push(listener);
        });
    }

    // usi → setoption → isready → usinewgame を、返事を待ちながら順番に送る
    async init(options = {}) {

        this.send("usi");
        await this.waitFor(line => line === "usiok");

        for (const name in options) {
            this.send(`setoption name ${name} value ${options[name]}`);
        }

        this.send("isready");
        await this.waitFor(line => line === "readyok");

        this.send("usinewgame");
    }

    // 局面を送って考えさせ、bestmove の手を返す
    async go(position, time = 1000) {
        this.send(position);
        const wait = this.waitFor(line => line.startsWith("bestmove"));
        this.send(`go btime 0 wtime 0 byoyomi ${time}`);
        const line = await wait;
        return line.split(" ")[1];
    }

    // プログラムの終了（quit を送り、終わらなければ強制終了）
    stop() {
        if (!this.process) return;
        this.send("quit");
        setTimeout(() => {
            if (this.process) {
                console.log("終了しないので強制終了します");
                this.process.kill();
            }
        }, 1000);
    }
}

module.exports = Engine;
