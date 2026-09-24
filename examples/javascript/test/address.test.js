import { test } from "node:test";
import assert from "node:assert/strict";
import { readAddress, dialable } from "../lib/address.js";

void test("a tcp address is tcp://host:port", () => {
  assert.deepEqual(readAddress("tcp://127.0.0.1:9"), { scheme: "tcp", host: "127.0.0.1", port: 9, url: "tcp://127.0.0.1:9" });
  assert.equal(readAddress("tcp://[::1]:80").host, "::1");
  assert.equal(readAddress("tcp://example.org:443").host, "example.org");
  assert.equal(readAddress("TCP://h:65535").scheme, "tcp");
  assert.equal(readAddress("HtTp://h/").scheme, "http");
  for (const s of ["127.0.0.1:9", "tcp://h", "tcp://h:", "tcp://h:0", "tcp://h:65536", "tcp://h:99999", "tcp://h:9/", "tcp://h:9?q", "tcp://h:9#f", "tcp://u@h:9", "tcp://[zz]:9", "tcp://::1:9"]) {
    assert.equal(readAddress(s), null, s);
  }
});

void test("a web address has a host and no user information or fragment", () => {
  for (const s of ["http://127.0.0.1:1/a?b=c", "https://example.org/", "ws://[::1]:2/", "wss://h/x"]) {
    assert.equal(readAddress(s)?.url, s, s);
  }
  for (const s of ["http://u@h/", "http://u:p@h/", "ws://h/#f", "http:///x", "ftp://h/", "mailto:a@b", "not a uri", 7]) {
    assert.equal(readAddress(s), null, String(s));
  }
});

void test("dialable keeps the addresses this kit dials, in order", () => {
  const at = ["ftp://h/", "ws://h:1/", 3, "tcp://h:2", "http://h:3/"];
  assert.deepEqual(dialable(at).map((a) => a.scheme), ["ws", "tcp", "http"]);
  assert.deepEqual(dialable("tcp://h:2"), []);
  assert.deepEqual(dialable(undefined), []);
});
