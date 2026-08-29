// Turns a SpeechRecognition error code into something a user can act on.
//
// The dictation hook used to discard these entirely, which is why dictation
// failing on a deployed origin looked like the button simply doing nothing:
// the most common cause — microphone permission never granted for the new
// origin — reports itself as `not-allowed` and was thrown away.
//
// Returns null for codes that aren't worth showing.
const MESSAGES = {
  "not-allowed":
    "Microphone access is blocked. Allow it from the icon at the right of the address bar, then try again.",
  "service-not-allowed":
    "Your browser blocked microphone access for this site. Check its site permissions and try again.",
  network:
    "Couldn't reach the speech service — check your connection and try again.",
  "audio-capture":
    "Couldn't find a microphone. Check that one is connected and not in use by another app.",
  "bad-grammar": "Dictation failed to start. Try again.",
  "language-not-supported":
    "That dictation language isn't supported by this browser. Pick another from the list.",
};

// Ordinary, expected conditions — silence and an explicit stop.
const SILENT = ["no-speech", "aborted"];

export function describeSpeechError(code) {
  if (SILENT.includes(code)) return null;
  if (MESSAGES[code]) return MESSAGES[code];
  return code
    ? `Dictation stopped unexpectedly (${code}).`
    : "Dictation stopped unexpectedly.";
}
