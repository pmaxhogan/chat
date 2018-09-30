const net = require("net");
const readline = require("readline");
const settings = require("./settings.json");
const EventEmitter = require("events");

//enable raw mode
if(process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.setPrompt("");

const stdin = new EventEmitter();
let buff = "";

process.stdin
  .on("data", data => {
    if(data.toString()=== "\u0003") {
    //Control+C exits
      process.exit();
    }

    buff += data;
    let lines = buff.split(/[\r\n|\n]/);
    buff = lines.pop();
    lines.forEach(line => stdin.emit("line", line));
  })
  .on("end", () => {
    if (buff.length > 0) stdin.emit("line", buff);
  });

const exit = () => {
  console.log("Connection ended.");
  process.exit();
};

const server = net.connect({
  host: process.argv[2],
  port: process.argv[3] || settings.port
}).
  on("error", (err) => {
    if(err.code === "ECONNRESET") return;

    throw err;
  }).
  on("data", (data) => {
    process.stdout.write(data.toString() + "\n");
  }).
  on("ready", () => {
    console.log("Connected to " + server.remoteAddress);

    rl.on("line", line => {
      server.write(line);
    });
  }).
  on("close", exit).
  on("end", exit).
  on("timeout", () => {
    console.log("Connection timed out.");
    server.destroy();
    process.exit();
  });
