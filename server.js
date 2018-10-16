#!/usr/bin/env node

// This program has some inconsistent styling when it comes to the function keyword vs. arrow functions,
// see https://github.com/nodejs/node/issues/14496

// requires
const net = require("net");
const readline = require("readline");

const settings = require("./settings.json");
const meta = require("./meta.json");

// validation
const regex = /\b|([\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g;
const stripBadChars = data => data.replace(regex, "");

const validateName = str => str.replace(/[^ -~]/g, "");

// other consts

// TODO read this from settings.json
const MOTD = "/help for help, /name to change name, Control + C to exit";

const messageTerminator = "\n";


if(process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.setPrompt("");

const ipBans = [];

// (Future suggestion, would need to modify spec) decouple the slashes so that a command prefix can be set in settings.json
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

    // TODO change this to something more indicative of its purpose ("targetUser" or something, idk).
    //  better yet, remove it since it's only used in a few cases (and it's assigned there anyway)
    let user;

    let name;

    // socket is undefined if the command was issued from the console
    const checkAdmin = () => !socket || socket.admin;

    /*
    * can find a user by name or IPv6
    * TODO support searching by IPv4
    * TODO figure out what to do if two clients have the same name,
    *  or if one client's name is another's IPv6
    */
    const findUser = name =>  clients.find(client => client.name === name.toLowerCase() || client.remoteAddress + ":" + client.remotePort === name);

    // TODO figure out how to make this less of a wall of text and more extensible
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
      // TODO call stripBadChars right after the message is read to save code when writing new commands
      respond("Unknown command " + stripBadChars(command));
    }
  }catch(e){
    console.error(e);
    respond("Unknown error.");
  }
};

// List of sockets
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
  // TODO make the number of connections per IP configurable via settings.json
  if(clients.some(client => client.remoteAddress === socket.remoteAddress) && socket.remoteAddress !== "127.0.0.1" && socket.remoteAddress !== "::ffff:127.0.0.1"){
    socket.safeWrite("One client per IP!");
    socket.end();
    return;
  }
  socket.name = socket.remoteAddress + ":" + socket.remotePort;
  clients.push(socket);

  // TODO make this a bit more readable, and, you know, *send the control message character*
  socket.sendControlMessage = (message, ...args) => {
    socket.safeWrite("·" + message + (args.length ? " " + args.join(" ").trim() : "") + "\n");
  };

  // TODO only send this when the client requests it
  socket.sendControlMessage("startmeta");
  socket.safeWrite(JSON.stringify(meta) + "\n");
  socket.sendControlMessage("endmeta");

  socket.safeWrite(MOTD);

  broadcast(socket.name + " joined", socket);


  socket.incompleteData = "";
  socket.on("data", function (data) {
    // If nothing was actually passed in
    if(!data) return;
    data = data.toString();

    // We just add to the buffer when there is no line terminator because messages aren't always sent all at once
    if(!data.includes(messageTerminator)) return socket.incompleteData += data;

    // (Suggestion) Why do we have both incompleteData and buffer? They do virtually the same thing, and could be reworked into one
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

  // Shouldn't we also notify everyone that the user left here?
  socket.on("end", function () {
    const idx = clients.indexOf(socket);

    // Should remove this right here v, replace with idx
    if(idx >= 0) clients.splice(clients.indexOf(socket), 1);
  });

  socket.on("close", function () {
    const idx = clients.indexOf(socket);
    if(idx >= 0) clients.splice(idx, 1);
    broadcast(socket.name + " left");
  });

  // Shouldn't we also notify everyone that the user left here?
  socket.on("error", (err) => {
    if(err.code === "ECONNRESET"){
      clients.splice(clients.indexOf(socket), 1);
      return;
    }

    console.log(err.code, "from", socket.name, err);
  });
}).on("error", (err) => { // (Suggestion) remove this, there's no point in catching an error and immediately throwing it again
  throw err;
});

rl.on("line", line => {
  if(line[0] === "/"){
    return runCommand(line, undefined, console.log);
  }
  broadcast("[server] " + line);
});

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
