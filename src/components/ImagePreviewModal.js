"use client";

import { useEffect } from "react";
import { Download, X } from "lucide-react";
import { formatFileSize } from "@/lib/attachments";

// Full-size look at an image attachment, shared by the note editor and the
// chat dock. Uploading an image and getting a download prompt back is the
// wrong default — the file is already on screen as a thumbnail, so clicking it
// enlarges it instead, with downloading kept here as an explicit action.
//
// `src` doubles as the open/closed switch: the caller passes null while
// nothing is being previewed.
export default function ImagePreviewModal({ src, attachment, onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-4 dark:bg-black/80"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center gap-3 pb-3 text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={attachment.filename}>
          {attachment.filename}
          <span className="ml-1.5 text-xs text-white/60">{formatFileSize(attachment.size)}</span>
        </p>
        <a
          href={src}
          download={attachment.filename}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/20"
        >
          <Download size={13} /> Download
        </a>
        <button
          type="button"
          onClick={onClose}
          title="Close preview"
          className="rounded-md p-1.5 transition-colors hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <img
          src={src}
          alt={attachment.filename}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}
