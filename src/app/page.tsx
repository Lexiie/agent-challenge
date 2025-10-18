"use client";

import { useCallback, useMemo, useState } from "react";
import UploadCard from "@ui/components/UploadCard";
import ProgressSteps from "@ui/components/ProgressSteps";
import ResultTable from "@ui/components/ResultTable";
import type { ExplanationItem } from "@/agent/explain";
import type { OCRResult } from "@/agent/ocr";

type StepStatus = "pending" | "active" | "complete";

type StepKey = "ocr" | "analysis" | "explanation";

type Step = {
  key: StepKey;
  label: string;
  status: StepStatus;
  description: string;
};

const INITIAL_STEPS: Step[] = [
  {
    key: "ocr",
    label: "OCR",
    status: "pending",
    description: "Waiting to read the label image.",
  },
  {
    key: "analysis",
    label: "Analysis",
    status: "pending",
    description: "Preparing ingredient heuristics and lookups.",
  },
  {
    key: "explanation",
    label: "Explanation",
    status: "pending",
    description: "Generating consumer-friendly insights.",
  },
];

const STEP_DESCRIPTIONS: Record<StepKey, { active: string; complete: string }> = {
  ocr: {
    active: "Uploading and reading the label with Interfaze VOCR…",
    complete: "OCR agent extracted text from the label.",
  },
  analysis: {
    active: "Matching glossary terms and risk rules…",
    complete: "Heuristics prepared for explanation agent.",
  },
  explanation: {
    active: "Summarizing ingredient impact for consumers…",
    complete: "Explanation ready with safety badges.",
  },
};

export default function LabelSimplifiedPage() {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summary, setSummary] = useState<string>();
  const [disclaimer, setDisclaimer] = useState<string>();
  const [items, setItems] = useState<ExplanationItem[]>([]);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<string>("");

  const updateStep = useCallback((key: StepKey, status: StepStatus, description?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.key === key
          ? {
              ...step,
              status,
              description: description ?? step.description,
            }
          : step
      )
    );
  }, []);

  const resetSteps = useCallback(() => {
    setSteps(INITIAL_STEPS);
  }, []);

  const latestRiskBadge = useMemo(() => {
    if (!items || items.length === 0) {
      return null;
    }
    const priority: Record<ExplanationItem["risk_level"], number> = {
      Red: 3,
      Yellow: 2,
      Green: 1,
      Unknown: 0,
    };
    return items.reduce<ExplanationItem | null>((current, item) => {
      if (!current) {
        return item;
      }
      return priority[item.risk_level] > priority[current.risk_level] ? item : current;
    }, null);
  }, [items]);

  const handleSubmit = useCallback(
    async ({ file, imageUrl }: { file?: File; imageUrl?: string }) => {
      if (!file && !imageUrl) {
        return;
      }

      setIsSubmitting(true);
      setError(null);
      resetSteps();
      setItems([]);
      setSummary(undefined);
      setDisclaimer(undefined);
      setOcrResult(null);
      setLastInput(imageUrl || file?.name || "");

      try {
        updateStep("ocr", "active", STEP_DESCRIPTIONS.ocr.active);

        let response: Response;
        if (file) {
          const formData = new FormData();
          formData.append("file", file);
          response = await fetch("/api/analyze", {
            method: "POST",
            body: formData,
          });
        } else {
          response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: imageUrl }),
          });
        }

        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem?.error || `Server returned ${response.status}`);
        }

        const data = (await response.json()) as {
          ocr: OCRResult;
          explanation: {
            summary: string;
            items: ExplanationItem[];
            disclaimer: string;
          };
        };

        setOcrResult(data.ocr);
        updateStep("ocr", "complete", STEP_DESCRIPTIONS.ocr.complete);

        updateStep("analysis", "active", STEP_DESCRIPTIONS.analysis.active);
        updateStep("analysis", "complete", STEP_DESCRIPTIONS.analysis.complete);

        updateStep("explanation", "active", STEP_DESCRIPTIONS.explanation.active);
        setItems(data.explanation?.items || []);
        setSummary(data.explanation?.summary);
        setDisclaimer(data.explanation?.disclaimer);
        updateStep("explanation", "complete", STEP_DESCRIPTIONS.explanation.complete);
      } catch (caught) {
        console.error("LabelSimplifiedPage", caught);
        setError((caught as Error).message || "Unexpected error occurred");
        resetSteps();
      } finally {
        setIsSubmitting(false);
      }
    },
    [resetSteps, updateStep]
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
        <header className="space-y-4 text-slate-200">
          <p className="text-xs uppercase tracking-[0.4em] text-sky-400">LabelSimplified</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">Decode product labels in a single pass</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Upload a snapshot of any food, cosmetic, or OTC label. Agent A extracts the raw ingredients,
            Agent B checks glossary hints and risk heuristics, then returns clear explanations with safety badges.
          </p>
          {lastInput && (
            <p className="text-xs text-slate-500">
              Last input: <span className="font-mono text-slate-300">{lastInput}</span>
            </p>
          )}
          {latestRiskBadge && (
            <p className="text-xs text-slate-400">
              Highest flagged ingredient: <span className="font-semibold text-amber-300">{latestRiskBadge.name}</span>
            </p>
          )}
          {ocrResult && (
            <p className="text-xs text-slate-500">
              OCR confidence: <span className="font-semibold text-slate-300">{Math.round(ocrResult.confidence * 100)}%</span>
            </p>
          )}
        </header>

        <UploadCard onSubmit={handleSubmit} isSubmitting={isSubmitting} />

        {error ? (
          <div className="rounded-lg border border-rose-600/60 bg-rose-500/20 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : (
          <ProgressSteps steps={steps} />
        )}

        <ResultTable summary={summary} disclaimer={disclaimer} items={items} />
      </div>
    </main>
  );
}
