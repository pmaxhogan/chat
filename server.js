const net = require("net");
const readline = require("readline");
const settings = require("./settings.json");

const MOTD = "/help for help, /name to change name, Control + C to exit";
const meta = require("./meta.json");
const messageTerminator = "\n";
const regex = /\b|([\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g;

const stripBadChars = data => data.replace(regex, "");

process.stdin.setRawMode(true);
process.stdin.resume();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.setPrompt("");

const runCommand = (string, socket, respond) => {
  try{
    string = string.substr(1);
    const args = string.split(" ");
    const command = args.shift();
    const commands = "name,list,changename,kick".split(",");
    let user;
    let name;

    const checkAdmin = () => !socket || socket.admin;

    switch (command) {
    case "name":
      if(!socket) return respond("This command can not be used from the console.");
      if(!args[0]) return respond("Specify a new name as the first arg.");
      name = args[0].toLowerCase();
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
    case "changename":
      if(!checkAdmin()) return respond("Insufficient permissions!");
      if(!args[0] || !args[1]) return respond("Specify the user as the first arg, and a new nick as the second.");
      args[1] = stripBadChars(args[1]);
      user = clients.find(client => client.name === args[0] || client.remoteAddress + ":" + client.remotePort === args[0]);
      if(!user) return respond("User not found.");
      if(clients.some(client => client.name === name)){
        return respond("Name already in use!");
      }
      user.name = args[1];
      respond("Name changed.");
      break;
    case "kick":
      if(!checkAdmin()) return respond("Insufficient permissions!");
      if(!args[0]) return respond("Please specify the user to kick.");
      user = clients.find(client => client.name === args[0] || client.remoteAddress + ":" + client.remotePort === args[0]);
      if(!user) return respond("User not found.");
      try{user.write("Kicked.");}catch(e){}//eslint-disable-line no-empty
      broadcast(user.name + " was kicked.", user);
      user.destroy();
      respond("Kicked.");
      break;
    default:
      respond("Unknown command " + stripBadChars(command));
    }
  }catch(e){
    console.error(e);
    respond("Unknown error.");
  }
};

const clients = [];

const server = net.createServer((socket) => {
  if(clients.some(client => client.remoteAddress === socket.remoteAddress) && socket.remoteAddress !== "127.0.0.1" && socket.remoteAddress !== "::ffff:127.0.0.1"){
    socket.write("One client per IP!");
    socket.end();
    return;
  }
  socket.name = socket.remoteAddress + ":" + socket.remotePort;
  clients.push(socket);

  socket.sendControlMessage = (message, ...args) => {
    socket.write("·" + message + (args.length ? " " + args.join(" ") : "") + "\n");
  };

  socket.sendControlMessage("startmeta");
  socket.write(JSON.stringify(meta));
  socket.sendControlMessage("endmeta");

  socket.write(MOTD);

  broadcast(socket.name + " joined", socket);


  socket.incompleteData = "";
  socket.on("data", function (data) {
    if(!data) return;
    data = data.toString();
    if(!data.includes(messageTerminator)) return socket.incompleteData += data;

    let buffer = "";
    data.split("").forEach(char => {
      if(char === messageTerminator){
        const message = buffer;

        broadcast("[" + socket.name + "] " + stripBadChars(message), socket);
        buffer = "";

        if(message[0] === "/"){
          return runCommand(message, socket, x => socket.write(x));
        }
      }else{
        buffer += char;
      }
    });
  });

  socket.on("end", function () {
    const idx = clients.indexOf(socket);
    if(idx >= 0) clients.splice(clients.indexOf(socket), 1);
  });

  socket.on("close", function () {
    const idx = clients.indexOf(socket);
    if(idx >= 0) clients.splice(idx, 1);
    broadcast(socket.name + " left");
  });

  socket.on("error", (err) => {
    if(err.code === "ECONNRESET"){
      clients.splice(clients.indexOf(socket), 1);
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
  message = message.trim();
  process.stdout.write(message + "\n");
  clients.forEach(function (client) {
    // Don"t want to send it to sender
    if (client === sender && sender) return;
    client.write(message);
  });
}
