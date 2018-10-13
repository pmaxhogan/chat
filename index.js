const net = require("net");
const readline = require("readline");
const settings = require("./settings.json");
const EventEmitter = require("events");
const messageTerminator = "\n";
const controlMessageChar = "\xB7";

if(process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.setPrompt("");

const stdin = new EventEmitter();
let buff = "";

process.stdin.on("data", data => {
  if(data.toString()=== "\u0003") {
  // Control+C exits
    process.exit();
  }

  buff += data;
  let lines = buff.split(/[\r\n|\n]/);
  buff = lines.pop();
  lines.forEach(line => stdin.emit("line", line));
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
    if(!data || !data.toString()) return;
    data = data.toString();
    const lines = data.split("\n");
    lines.forEach(line => {
      if(line[0] === controlMessageChar){
        const split = line.substr(1).split(" ");
        const command = split[0];
        const args = split.splice(1);

        // TODO hide the metadata from the user and assign it to a global variable
        switch(command){
        case "startmeta":
          isMeta = true; // eslint-disable-line no-undef
          break;
        case "endmeta":
          isMeta = true; // eslint-disable-line no-undef
          break;
        default:
          console.log("Unknown command", command, args);
        }

        process.stdout.write("Control command " + command + " args " + args.join(" ") + "\n");
      }else{
        process.stdout.write(line.toString() + "\n");
      }
    });
  }).
  on("ready", () => {
    console.log("Connected to " + server.remoteAddress);

    rl.on("line", line => {
      server.write(line.trim() + messageTerminator);
    });
  }).
  on("close", exit).
  on("end", exit).
  on("timeout", () => {
    console.log("Connection timed out.");
    server.destroy();
    process.exit();
  });
