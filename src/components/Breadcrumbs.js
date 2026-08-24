"use client";

import Link from "next/link";

// Odoo-style breadcrumb trail. `items` is root-first; the last item has
// no `href` since it's the current page and renders as plain text.
export default function Breadcrumbs({ items }) {
  return (
    <nav className="mb-2 mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-slate-800 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
