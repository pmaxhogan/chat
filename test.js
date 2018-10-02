/* global describe, it*/
const expect = require("chai").expect;
const net = require("net");
const child_process = require("child_process");

describe("server", () => {
  describe("startup", () => {
    it("should start", () => {
      child_process.execFile("./server.js", (err) => {
        expect(err).to.equal(undefined);
      });
    });
  });
});
