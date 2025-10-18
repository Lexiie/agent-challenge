"use client";

type StepStatus = "pending" | "active" | "complete";

type ProgressStep = {
  key: string;
  label: string;
  status: StepStatus;
  description?: string;
};

type ProgressStepsProps = {
  steps: ProgressStep[];
};

const STATUS_STYLES: Record<StepStatus, string> = {
  pending: "border-slate-700 text-slate-400",
  active: "border-sky-400 bg-sky-500/10 text-sky-300",
  complete: "border-emerald-500 bg-emerald-500/10 text-emerald-300",
};

const DOT_STYLES: Record<StepStatus, string> = {
  pending: "bg-slate-700",
  active: "bg-sky-400",
  complete: "bg-emerald-500",
};

export default function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-md">
      <header className="mb-4 text-slate-200">
        <h2 className="text-xl font-semibold">Analysis progress</h2>
        <p className="text-sm text-slate-400">LabelSimplified runs OCR, analysis, then explanation.</p>
      </header>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition ${STATUS_STYLES[step.status]}`}
          >
            <span className={`mt-1 h-3 w-3 flex-none rounded-full ${DOT_STYLES[step.status]}`} aria-hidden />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium uppercase tracking-wide text-xs text-slate-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="text-base text-slate-200">{step.label}</p>
              </div>
              {step.description && (
                <p className="mt-1 text-sm text-slate-400">{step.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
