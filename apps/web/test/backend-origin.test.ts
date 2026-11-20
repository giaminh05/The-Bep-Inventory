import assert from "node:assert/strict";
import test from "node:test";
import { parseBackendOrigin } from "../lib/backend-origin.ts";

test("backend origin is explicitly optional with no operational fallback", () => {
  assert.equal(parseBackendOrigin(undefined), undefined);
  assert.equal(parseBackendOrigin(""), undefined);
});

test("accepts HTTPS origins and loopback-only HTTP origins", () => {
  for (const value of [
    "https://inventory.example.com",
    "http://127.0.0.1:4170",
    "http://localhost:4170",
    "http://[::1]:4170",
  ]) {
    assert.equal(parseBackendOrigin(value), new URL(value).origin);
  }
});

test("rejects malformed, credential-bearing, non-origin and insecure remote URLs", () => {
  for (const value of [
    "localhost:4170",
    "/api",
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/api",
    "https://example.com/?x=1",
    "https://example.com/#section",
    "ftp://localhost",
    " https://example.com",
    "https://example.com?",
    "https://example.com#",
    "https:example.com",
    "https://example.com/a/..",
    "https://example.com/./",
    "https://example.com\\",
  ]) {
    assert.throws(() => parseBackendOrigin(value), /BEP_API_ORIGIN/);
  }
});
