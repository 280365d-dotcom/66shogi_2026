const WebSocket = require("ws");
const { spawn } = require("child_process");

const wss = new WebSocket.Server({
    port: 8080
});

const engine = spawn(
    "./fairy-stockfish-tools.exe"
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

    ws.on("message", msg => {

        engine.stdin.write(
            msg.toString() + "\n"
        );

    });

});