const fs = require("fs");
const {execSync} = require("child_process");

const removeDir = dir => {
  try{
    fs.readDirSync(dir).forEach(file => fs.unlinkSync(dir + "/" + file));
  }catch(e){} // eslint-disable-line no-empty
};

removeDir("-bin");
try{
  fs.mkdirSync("bin");
}catch(e){} // eslint-disable-line no-empty
console.log("building client");
execSync("nexe -t windows-x64-10.10.0 index.js --name client --output bin/client.exe");
console.log("building server");
execSync("nexe -t windows-x64-10.10.0 server.js --name server --output bin/server.exe");
