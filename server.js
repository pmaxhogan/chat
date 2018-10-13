#!/usr/bin/env node

const net = require("net");
const readline = require("readline");
const settings = require("./settings.json");

const MOTD = "/help for help, /name to change name, Control + C to exit";
const meta = require("./meta.json");
const messageTerminator = "\n";
const regex = /\b|([\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g;
const validateName = str => str.replace(/[^ -~]/g, "");

const stripBadChars = data => data.replace(regex, "");

if(process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.setPrompt("");

const ipBans = [];
const commands = [
  "/kick",
  "/changename",
  "/list",
  "/help",
  "/name",
  "/quit",
  "/banip",
  "/whois",
  "/promote",
  "/demote"
];

const runCommand = (string, socket, respond) => {
  try{
    string = string.substr(1);
    const args = string.split(" ");
    const command = args.shift();
    let user;
    let name;

    const checkAdmin = () => !socket || socket.admin;
    const findUser = name =>  clients.find(client => client.name === name.toLowerCase() || client.remoteAddress + ":" + client.remotePort === name);

    switch (command) {
    case "quit":
      socket.end();
      setTimeout(() => {
        if(!socket.destroyed) socket.destroy();
      }, 1000);
      break;
    case "name":
      if(!socket) return respond("This command can not be used from the console.");
      if(!args[0]) return respond("Specify a new name as the first arg.");
      name = validateName(args[0]).toLowerCase();
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
      if(!checkAdmin()) return respond("Insufficient permission!");
      if(!args[0] || !args[1]) return respond("Specify the user as the first arg, and a new nick as the second.");
      name = validateName(args[0]).toLowerCase();
      user = findUser(args[0]);
      if(!user) return respond("User not found.");
      if(clients.some(client => client.name === name)){
        return respond("Name already in use!");
      }
      if(!validateName(user.name)) return respond("Your nickname must only contain non-control ASCII characters.");
      user.name = args[1];
      respond("Name changed.");
      break;
    case "kick":
      if(!checkAdmin()) return respond("Insufficient permission!");
      if(!args[0]) return respond("Please specify the user to kick.");
      user = findUser(args[0]);
      if(!user) return respond("User not found.");
      clients.forEach(client => {
        try{client.sendControlMessage("kicked", ...args.splice(1));}catch(e){}//eslint-disable-line no-empty
      });
      user.destroy();
      break;
    case "banip":
      if(!checkAdmin()) return respond("Insufficient permission!");
      if(!args[0]) return respond("Please specify the ip to ban.");
      if(ipBans.includes(args[0])) return respond("Already banned that ip!");
      clients.forEach(client => {
        try{
          client.sendControlMessage("ipbanned", ...[args[0]].concat(args.splice(1)));
          if(client.remoteAddress === args[0]) client.destroy();
        }catch(e){}//eslint-disable-line no-empty
      });
      ipBans.push(args[0]);
      break;
    case "whois":
      if(!args[0]) return respond("Please specify the user to find the IP of.");
      user = findUser(args[0]);
      if(!user) return respond("Unknown user.");
      respond(user.remoteAddress + ":" + user.remotePort);
      break;
    case "promote":
      if(!checkAdmin()) return respond("Insufficient permission!");
      user = findUser(args[0]);
      if(!user) return respond("Unknown user.");
      respond("Promoted.");
      user.admin = true;
      break;
    case "demote":
      if(!checkAdmin()) return respond("Insufficient permission!");
      user = findUser(args[0]);
      if(!user) return respond("Unknown user.");
      respond("Demoted.");
      user.admin = false;
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
  socket.safeWrite = (...args) => {
    if(!socket.destroyed) socket.write(...args);
  };
  if(ipBans.includes(socket.remoteAddress)){
    console.log(socket.remoteAddress, "tried to connect again...");
    socket.safeWrite("IP banned!");
    socket.destroy();
    return;
  }
  if(clients.some(client => client.remoteAddress === socket.remoteAddress) && socket.remoteAddress !== "127.0.0.1" && socket.remoteAddress !== "::ffff:127.0.0.1"){
    socket.safeWrite("One client per IP!");
    socket.end();
    return;
  }
  socket.name = socket.remoteAddress + ":" + socket.remotePort;
  clients.push(socket);

  socket.sendControlMessage = (message, ...args) => {
    socket.safeWrite("·" + message + (args.length ? " " + args.join(" ").trim() : "") + "\n");
  };

  socket.sendControlMessage("startmeta");
  socket.safeWrite(JSON.stringify(meta) + "\n");
  socket.sendControlMessage("endmeta");

  socket.safeWrite(MOTD);

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

        buffer = "";
        if(message[0] === "/"){
          return runCommand(message, socket, x => socket.safeWrite(x));
        }

        broadcast("[" + socket.name + "] " + stripBadChars(message), socket);
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
    if (client === sender && sender || client.destroyed) return;
    try{
      client.write(message);
    }catch(e){
      console.error("Couldn't send message to ", client.name);
    }
  });
}
