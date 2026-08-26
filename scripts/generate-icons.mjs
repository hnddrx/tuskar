#!/usr/bin/env node
// One-off script: generates the static PWA icon PNGs from the app's brand
// mark — the three-column logo in src/components/Logo.js, drawn here with
// next/og's ImageResponse. Run with: node scripts/generate-icons.mjs
// Re-run only if the brand mark changes — the output files are checked in.
//
// Geometry is expressed in the logo's own 32-unit design grid and scaled to
// each output size, so this stays in step with Logo.js and icon.svg.
import { ImageResponse } from "next/og.js";
import { writeFile } from "node:fs/promises";

// [x, width, height] on the 32-unit grid; all three share a baseline at y=25.
const BARS = [
  { width: 4.5, height: 12, color: "rgba(255,255,255,0.6)" },
  { width: 4.5, height: 18, color: "#ffffff" },
  { width: 4.5, height: 9, color: "#818cf8" },
];
const GAP = 2.25;
const BASELINE_FROM_BOTTOM = 7;

async function makeIcon(size, radius) {
  const u = size / 32;
  const img = new ImageResponse(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: GAP * u,
          paddingBottom: BASELINE_FROM_BOTTOM * u,
          background: "#0f172a",
          borderRadius: radius,
        },
        children: BARS.map((bar, i) => ({
          type: "div",
          key: i,
          props: {
            style: {
              width: bar.width * u,
              height: bar.height * u,
              borderRadius: (bar.width / 2) * u,
              background: bar.color,
            },
          },
        })),
      },
    },
    { width: size, height: size }
  );
  return Buffer.from(await img.arrayBuffer());
}

// Each icon goes to two places: public/ for the ones the web manifest points
// at by URL, and src/app/ for Next's file-convention icons (which become the
// <link rel="icon"> tags). Same bytes both sides — writing them from one run
// is what stops the two sets drifting apart when the mark changes.
async function write(paths, buffer, label) {
  for (const p of paths) await writeFile(p, buffer);
  console.log(`wrote ${label} (${buffer.length} bytes) -> ${paths.join(", ")}`);
}

async function main() {
  await write(
    ["public/icon-192.png", "src/app/icon0.png"],
    await makeIcon(192, 32),
    "192x192"
  );
  await write(
    ["public/icon-512.png", "src/app/icon1.png"],
    await makeIcon(512, 85),
    "512x512"
  );
  // Apple touch icons are masked to a rounded square by iOS itself, so this
  // one is generated square.
  await write(
    ["public/apple-icon.png", "src/app/apple-icon.png"],
    await makeIcon(180, 0),
    "180x180 (apple)"
  );
}

main().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
