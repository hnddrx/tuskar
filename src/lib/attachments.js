// Decides what may be attached to a note and how it is served back.
//
// Classification is driven by the filename extension, never the browser-
// supplied content type: `type` is attacker-controlled on an upload, so an
// allowlist keyed on it would wave through anything.

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB

// Rendered inline in the note editor.
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "bmp"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "ogg", "oga", "webm", "aac", "flac"];

// Downloaded rather than rendered. SVG lives here rather than with the images
// on purpose — an inline SVG served from our own origin runs script in the
// signed-in user's session.
const FILE_EXTENSIONS = [
  "pdf",
  "doc", "docx", "rtf", "odt",
  "xls", "xlsx", "csv", "ods",
  "ppt", "pptx", "odp",
  "txt", "md", "json", "xml", "log",
  "zip",
  "svg",
];

function extensionOf(name) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ""));
  return match ? match[1].toLowerCase() : null;
}

/**
 * @param  {{name: string, type?: string, size?: number}} file
 * @return {{kind: "image"|"audio"|"file"} | {error: string}}
 */
export function classifyAttachment(file) {
  const size = Number(file?.size) || 0;
  if (size > MAX_ATTACHMENT_SIZE) {
    return { error: "File is too large (max 20MB)" };
  }

  const ext = extensionOf(file?.name);
  if (!ext) {
    return { error: "That file type is not allowed — the file needs an extension" };
  }
  if (IMAGE_EXTENSIONS.includes(ext)) return { kind: "image" };
  if (AUDIO_EXTENSIONS.includes(ext)) return { kind: "audio" };
  if (FILE_EXTENSIONS.includes(ext)) return { kind: "file" };

  return { error: `That file type is not allowed (.${ext})` };
}

// Anything we don't render ourselves is forced to download, so an uploaded
// document can never execute as a page on this origin.
export function dispositionFor(kind) {
  return kind === "image" || kind === "audio" ? "inline" : "attachment";
}

// The `accept` attribute for the note editor's file picker — a convenience
// filter in the OS dialog; `classifyAttachment` is the real gate.
export const ATTACHMENT_ACCEPT = [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS, ...FILE_EXTENSIONS]
  .map((e) => `.${e}`)
  .join(",");

// "1.5 KB", "5 MB" — one decimal place only when it adds information, and an
// empty string for an unknown size so the UI renders nothing rather than NaN.
export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return "";
  const size = Number(bytes);
  if (size < 1024) return `${Math.round(size)} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
