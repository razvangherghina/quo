import assert from "node:assert/strict";
import { test } from "node:test";

import { carrierWritingOf, parseAddress, tcpAddress, webAddress } from "../address.js";

test("a URI with a scheme is taken apart", () => {
  assert.deepEqual(parseAddress("HTTPS://user@host.example:8443/a/b?c=d#e"), {
    scheme: "https",
    authority: "user@host.example:8443",
    userinfo: "user",
    host: "host.example",
    port: "8443",
    path: "/a/b",
    query: "c=d",
    fragment: "e",
  });
  assert.equal(parseAddress("zz://nowhere").scheme, "zz");
  assert.equal(parseAddress("urn:quo:x").authority, null);
  assert.equal(parseAddress("ws://[::1]:80/").host, "[::1]");
});

test("a string that is not a URI with a scheme is no address", () => {
  for (const no of ["127.0.0.1:9", "//host/path", "/path", "", "1tcp://h:1", "tcp://h:1/a b", "tcp://h:1/%zz", "tcp://[::1:1", "tcp://h]:1", 5, null, ["tcp://h:1"]]) {
    assert.equal(parseAddress(no), null, JSON.stringify(no));
  }
});

test("a tcp address is tcp://host:port", () => {
  assert.deepEqual(tcpAddress("tcp://127.0.0.1:4000"), { host: "127.0.0.1", port: 4000 });
  assert.deepEqual(tcpAddress("tcp://[::1]:80"), { host: "::1", port: 80 });
  assert.deepEqual(tcpAddress("TCP://example.org:65535"), { host: "example.org", port: 65535 });
  assert.deepEqual(tcpAddress("tcp://h:000080"), { host: "h", port: 80 });
  assert.deepEqual(tcpAddress("tcp://h:1"), { host: "h", port: 1 });
  for (const no of [
    "127.0.0.1:4000",
    "tcp://127.0.0.1",
    "tcp://127.0.0.1:",
    "tcp://:80",
    "tcp://host:0",
    "tcp://host:65536",
    "tcp://host:0000",
    "tcp://host:0065536",
    "tcp://host:x",
    "tcp://::1:80",
    "tcp://host:80/",
    "tcp://host:80/path",
    "tcp://host:80?q",
    "tcp://host:80#f",
    "tcp://u@host:80",
    "tcp:host:80",
    "http://host:80",
  ]) {
    assert.equal(tcpAddress(no), null, no);
  }
});

test("a web address is a URI of the post or the held line with a host", () => {
  assert.deepEqual(webAddress("http://127.0.0.1:8080/quo/in?w=1"), { scheme: "http", form: "post", host: "127.0.0.1", port: 8080, path: "/quo/in?w=1" });
  assert.deepEqual(webAddress("wss://example.org"), { scheme: "wss", form: "held line", host: "example.org", port: 443, path: "/" });
  assert.deepEqual(webAddress("ws://[::1]/x"), { scheme: "ws", form: "held line", host: "::1", port: 80, path: "/x" });
  assert.deepEqual(webAddress("https://h?q"), { scheme: "https", form: "post", host: "h", port: 443, path: "/?q" });
  for (const no of ["http:/path", "http:///path", "http://u:p@h/", "http://h/#f", "http://h:99999/", "http://h:x/", "tcp://h:1", "ftp://h/"]) {
    assert.equal(webAddress(no), null, no);
  }
});

test("an address of a carrier's scheme is held to that carrier's writing, and other schemes to none", () => {
  assert.equal(carrierWritingOf("tcp://h:1"), null);
  assert.equal(carrierWritingOf("wss://h/q"), null);
  assert.equal(carrierWritingOf("zz://anything#at-all"), null);
  assert.equal(carrierWritingOf("not an address"), null);
  assert.equal(typeof carrierWritingOf("tcp://h"), "string");
  assert.equal(typeof carrierWritingOf("https://u@h/"), "string");
});
