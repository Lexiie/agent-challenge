"use client";

import type { ExplanationItem } from "@/agent/explain";

type ResultTableProps = {
  summary?: string;
  disclaimer?: string;
  items: ExplanationItem[];
};

const BADGE_STYLES: Record<ExplanationItem["risk_level"], string> = {
  Green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Yellow: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Red: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  Unknown: "bg-slate-700/40 text-slate-200 border-slate-500/40",
};

export default function ResultTable({ summary, disclaimer, items }: ResultTableProps) {
  if (!items || items.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">
        <h2 className="text-xl font-semibold text-slate-200">Explanation</h2>
        <p className="mt-2 text-sm text-slate-400">
          Upload a label to see ingredient explanations.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-md">
      <header className="space-y-2 text-slate-200">
        <h2 className="text-xl font-semibold">Explanation</h2>
        {summary && <p className="text-sm text-slate-300">{summary}</p>}
      </header>

      <div className="mt-4">
        <div className="hidden overflow-x-auto rounded-lg border border-slate-800 md:block">
          <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
            <thead className="bg-slate-900/80 text-slate-300">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Ingredient</th>
                <th scope="col" className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Function</th>
                <th scope="col" className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Risk</th>
                <th scope="col" className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Why</th>
                <th scope="col" className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Certainty</th>
                <th scope="col" className="px-4 py-3 text-left font-medium uppercase tracking-wide text-xs">Sources</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/60">
              {items.map((item) => (
                <tr key={item.name} className="align-top">
                  <td className="px-4 py-3 font-medium text-slate-100">{item.name}</td>
                  <td className="px-4 py-3 text-slate-300">{item.function}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE_STYLES[item.risk_level]}`}
                    >
                      {item.risk_level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.why}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {(item.certainty * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    <ul className="space-y-1">
                      {item.sources.map((source) => (
                        <li key={source}>
                          {source.startsWith("http") ? (
                            <a
                              href={source}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:text-sky-300"
                            >
                              {source}
                            </a>
                          ) : (
                            <span>{source}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:hidden">
          {items.map((item) => (
            <article
              key={item.name}
              className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/70 p-4 shadow-sm"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-100">{item.name}</h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE_STYLES[item.risk_level]}`}
                >
                  {item.risk_level}
                </span>
              </header>
              <div className="space-y-3 text-sm text-slate-300">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Function</p>
                  <p className="mt-1 text-slate-200">{item.function}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why</p>
                  <p className="mt-1">{item.why}</p>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wide">Certainty</span>
                  <span className="text-slate-200">{(item.certainty * 100).toFixed(0)}%</span>
                </div>
                {item.sources.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sources</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-400">
                      {item.sources.map((source) => (
                        <li key={source}>
                          {source.startsWith("http") ? (
                            <a
                              href={source}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:text-sky-300"
                            >
                              {source}
                            </a>
                          ) : (
                            <span>{source}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {disclaimer && (
        <p className="mt-4 text-xs text-slate-500">{disclaimer}</p>
      )}
    </section>
  );
}
