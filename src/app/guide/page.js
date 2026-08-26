import manifest from "@/data/guideManifest.json";
import { GUIDE_SECTIONS } from "@/data/guideContent";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "User Guide — Taskar" };

// Screenshots are keyed by section id, so a section renders its image only
// once `npm run guide` has captured one for it. The written guide stands on
// its own in the meantime — it is the source of truth, not a caption track.
const shotsById = Object.fromEntries(
  manifest.filter((s) => s.id).map((s) => [s.id, s])
);

export default function GuidePage() {
  const hasShots = Object.keys(shotsById).length > 0;

  return (
    <div className="flex-1">
      <PageHeader
        title="User Guide"
        subtitle="How Taskar works, end to end."
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-[200px_1fr]">
          {/* Contents */}
          <nav className="hidden lg:block">
            <div className="sticky top-28">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Contents
              </p>
              <ul className="space-y-1">
                {GUIDE_SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block rounded-md px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="min-w-0">
            {!hasShots && (
              <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Screenshots aren&apos;t captured yet. With the dev server
                running and a signed-in session saved, run{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                  npm run guide
                </code>{" "}
                to add one to each section below and refresh{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                  USER_GUIDE.md
                </code>
                .
              </div>
            )}

            <div className="space-y-12">
              {GUIDE_SECTIONS.map((section, i) => {
                const shot = shotsById[section.id];
                return (
                  <section key={section.id} id={section.id} className="scroll-mt-28">
                    <div className="mb-1 flex items-baseline gap-2.5">
                      <span className="text-xs font-semibold tabular-nums text-slate-300 dark:text-slate-600">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                        {section.title}
                      </h2>
                    </div>

                    {section.lede && (
                      <p className="mb-3 pl-7 text-sm text-slate-400 dark:text-slate-500">
                        {section.lede}
                      </p>
                    )}

                    <div className="space-y-3 pl-7">
                      {section.body.map((para, j) => (
                        <p
                          key={j}
                          className="text-sm leading-relaxed text-slate-600 dark:text-slate-400"
                        >
                          {para}
                        </p>
                      ))}

                      {section.points && (
                        <dl className="mt-4 space-y-2.5 border-l-2 border-slate-100 pl-4 dark:border-slate-800">
                          {section.points.map(([term, def]) => (
                            <div key={term}>
                              <dt className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {term}
                              </dt>
                              <dd className="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                {def}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {shot && (
                        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={shot.file}
                            alt={section.title}
                            className="w-full"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
