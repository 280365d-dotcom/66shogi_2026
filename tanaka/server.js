const WebSocket = require("ws");
const { spawn } = require("child_process");

const wss = new WebSocket.Server({
    port: 8080
});

// MacでもWindowsでも動く
const path = require("path");

const engineFile = 
    process.platform == "win32"
        ? "fairy-stockfish-tools.exe"
        : "fairy-stockfish-mac";

const engine = spawn(
    path.join(__dirname, engineFile),
    [],
    { cwd: __dirname }
);


engine.stdout.on("data", data => {

    const text = data.toString();

    console.log(text);

    wss.clients.forEach(client => {

        if(client.readyState === WebSocket.OPEN){

            client.send(text);

        }
    });

});

wss.on("connection", ws => {

    console.log("GUI Connected");

    // ブラウザから命令が届いたら、ここが実行される
    ws.on("message", msg => {
        engine.stdin.write(msg.toString() + "\n");
    });

});