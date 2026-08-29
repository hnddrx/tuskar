import test from "node:test";
import assert from "node:assert/strict";

import { describeSpeechError } from "./speechErrors.js";

test("a blocked microphone tells the user where to unblock it", () => {
  const message = describeSpeechError("not-allowed");
  assert.match(message, /microphone/i);
  assert.match(message, /address bar/i);
});

test("a browser-level block is reported as a permission problem", () => {
  assert.match(describeSpeechError("service-not-allowed"), /microphone|permission/i);
});

test("a network failure names the connection, not the microphone", () => {
  const message = describeSpeechError("network");
  assert.match(message, /connection|network/i);
  assert.doesNotMatch(message, /address bar/i);
});

test("a missing microphone is distinguished from a blocked one", () => {
  assert.match(describeSpeechError("audio-capture"), /no microphone|couldn't find/i);
});

test("hearing nothing is not reported as an error", () => {
  // `no-speech` fires on ordinary silence; surfacing it would cry wolf.
  assert.equal(describeSpeechError("no-speech"), null);
});

test("a deliberate stop is not reported as an error", () => {
  assert.equal(describeSpeechError("aborted"), null);
});

test("an unrecognised code still surfaces something actionable", () => {
  const message = describeSpeechError("some-new-code");
  assert.match(message, /some-new-code/);
});

test("a missing code produces a generic message rather than crashing", () => {
  assert.equal(typeof describeSpeechError(undefined), "string");
});
