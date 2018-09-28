const net = require("net");
const readline = require('readline');
const settings = require("./settings.json");
const EventEmitter = require("events");

const MOTD = "/help for help, /name to change name, Control + C to exit";

const regex = /\b|([\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g;

process.stdin.setRawMode(true);
process.stdin.resume();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.setPrompt("");

function stdinLineByLine() {
  const stdin = new EventEmitter();
  let buff = "";

  process.stdin
  .on("data", data => {
    if(data.toString()=== "\u0003") {
      process.exit();
    }
    buff += data;
    lines = buff.split(/[\r\n|\n]/);
    buff = lines.pop();
    lines.forEach(line => stdin.emit("line", line));
  })
  .on("end", () => {
    if (buff.length > 0) stdin.emit("line", buff);
  });

  return stdin;
}

const runCommand = (string, socket, respond) => {
  try{
    string = string.substr(1);
    const args = string.split(" ");
    const command = args.shift();
    const commands = "name,list".split(",");

    switch (command) {
      case "name":
        if(!socket) return respond("This command can not be used from the console.");
        if(!args[0]) return respond("Specify a new name as the first arg.");
        const name = args[0].toLowerCase();
        if(clients.some(client => client.name === name)){
          return respond("Name already in use!");
        }
        broadcast(socket.name + " changed their name to " + name);
        socket.name = name;
        break;
      case "help":
        respond("Commands: " + commands.join(", "));
        break;
      case "list":
        respond(clients.map(c => c.name).join(", "));
        break;
      default:
        respond("Unknown command");
    }
  }catch(e){
    console.error(e);
    respond("Unknown error.");
  }
};

const stdin = stdinLineByLine();

const clients = [];

const server = net.createServer((socket) => {
  if(clients.some(client => client.remoteAddress === socket.remoteAddress)){
    socket.write("One client per IP!");
    socket.end();
    return;
  }
  socket.name = socket.remoteAddress + ":" + socket.remotePort;


  clients.push(socket);

  broadcast(socket.name + " joined", socket);
  socket.write(MOTD);

  socket.on("data", function (data) {
    if(!data) return;
    data = data.toString();
    if(data[0] === "/"){
      return runCommand(data, socket, x => socket.write(x));
    }
    broadcast("[" + socket.name + "] " + data.replace(regex, ""), socket);
  });

  // Remove the client from the list when it leaves
  socket.on("end", function () {
    clients.splice(clients.indexOf(socket), 1);
    broadcast(socket.name + " left");
  });

  socket.on("error", (err) => {
    if(err.code === "ECONNRESET"){
      clients.splice(clients.indexOf(socket), 1);
      broadcast(socket.name + " left");
      return;
    }

    console.log(err.code, "from", socket.name, err);
  });
}).on("error", (err) => {
  // handle errors here
  throw err;
});

rl.on("line", line => {
  if(line[0] === "/"){
    return runCommand(line, undefined, console.log);
  }
  broadcast("[server] " + line);
});

// grab an arbitrary unused port.
server.listen(process.argv[3] || settings.port, () => {
  console.log("opened server on", server.address());
});

function broadcast(message, sender) {
  message = message.replace(/(.)\x08/g, "");
  process.stdout.write(message + "\n");
  clients.forEach(function (client) {
    // Don"t want to send it to sender
    if (client === sender && sender) return;
    client.write(message);
  });
}
