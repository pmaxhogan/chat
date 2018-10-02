/* global describe, it*/
const expect = require("chai").expect;
const net = require("net");
const child_process = require("child_process");

const sleep = time => new Promise(resolve => setTimeout(resolve, time).unref());

describe("server", async function(){
  const server = child_process.exec("node server.js");
  server.unref();

  let data = "";
  server.stdout.on("data", newData => {
    data += newData.toString();
  });
  server.stderr.pipe(process.stdout);
  it("should start in 1 second", async function(){
    await sleep(1000);
    expect(data).to.include("opened");
  });

  let socket;
  it("should accept connections", async function(){
    await sleep(500);
    socket = net.connect(56789);
    socket.unref();
    socket.on("ready", () => socket.isReady = true);
    await sleep(250);
    expect(socket.connecting).to.equal(false);
    expect(socket.isReady).to.equal(true);
    expect(socket).to.not.equal(undefined);
    expect(socket.isDestroyed).to.not.equal(true);
  });
  it("should allow /help", async function(){
    await sleep(550);
    socket.write("/help\n");
    await sleep(250);
    expect(socket).to.not.equal(undefined);
    expect(socket.isDestroyed).to.not.equal(true);
  });
});
