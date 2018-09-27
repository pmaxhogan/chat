const fs = require("fs");
const {execSync} = require("child_process");

const removeDir = dir => {
  try{
    fs.readDirSync(dir).forEach(file => fs.unlinkSync(dir + "/" + file));
  }catch(e){}
};

removeDir("client-bin");
removeDir("server-bin");
try{
  fs.mkdirSync("client-bin");
  fs.mkdirSync("server-bin");
}catch(e){}
console.log("building client");
execSync("pkg index.js --out-path client-bin/");
console.log("building server");
execSync("pkg server.js --out-path server-bin/");
