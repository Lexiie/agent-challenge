import fs from "node:fs/promises";
import path from "node:path";
import type { OCRResult } from "./ocr";
import { fetch_json } from "@/tools/fetch_json";

export type ExplanationItem = {
  name: string;
  function: string;
  risk_level: "Green" | "Yellow" | "Red" | "Unknown";
  why: string;
  certainty: number;
  sources: string[];
};

export type ExplanationResult = {
  summary: string;
  items: ExplanationItem[];
  disclaimer: string;
};

type GlossaryEntry = {
  name: string;
  synonyms?: string[];
  description?: string;
  common_uses?: string[];
};

type RiskRule = {
  pattern: string;
  risk_level: ExplanationItem["risk_level"];
  reason: string;
  applies_to?: string[];
};

type ExternalRecord = {
  ingredient: string;
  source: string;
  data: Record<string, unknown>;
};

const SYSTEM_PROMPT = [
  "Explain for lay users in English.",
  "Use glossary and risk rules as hints.",
  "When in doubt, set risk_level=Unknown and explain uncertainty.",
  "No medical or regulatory advice.",
  "Return ExplanationResult in strict JSON.",
].join(" ");

const MCP_DIR = path.join(process.cwd(), "mcp", "file-server");

const DEFAULT_RESULT: ExplanationResult = {
  summary: "Ingredient explanations unavailable while the language service is offline.",
  items: [],
  disclaimer: "This is not medical advice.",
};

async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const filePath = path.join(MCP_DIR, fileName);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`explainIngredients: unable to read ${fileName}`, error);
    return fallback;
  }
}

function matchGlossaryEntries(ingredients: string[], glossary: GlossaryEntry[]): Record<string, GlossaryEntry> {
  const matches: Record<string, GlossaryEntry> = {};

  for (const ingredient of ingredients) {
    const needle = ingredient.toLowerCase();
    const entry = glossary.find((item) => {
      if (item.name.toLowerCase() === needle) {
        return true;
      }
      return (item.synonyms || []).some((syn) => syn.toLowerCase() === needle);
    });

    if (entry) {
      matches[ingredient] = entry;
    }
  }

  return matches;
}

function applyRiskRules(ingredients: string[], rules: RiskRule[]): Record<string, RiskRule[]> {
  const result: Record<string, RiskRule[]> = {};

  for (const ingredient of ingredients) {
    const lower = ingredient.toLowerCase();
    const hits = rules.filter((rule) => {
      if (rule.applies_to && rule.applies_to.some((name) => name.toLowerCase() === lower)) {
        return true;
      }
      return lower.includes(rule.pattern.toLowerCase());
    });

    if (hits.length > 0) {
      result[ingredient] = hits;
    }
  }

  return result;
}

function shouldFetchExternally(): boolean {
  return (process.env.WEB_FETCH_ENABLED || "").toLowerCase() === "true";
}

async function fetchExternalRecords(ingredients: string[], domain: OCRResult["domain_guess"]): Promise<ExternalRecord[]> {
  if (!shouldFetchExternally() || ingredients.length === 0) {
    return [];
  }

  const records: ExternalRecord[] = [];
  const limit = Math.min(ingredients.length, Number(process.env.OFF_FETCH_LIMIT || 3));

  for (let index = 0; index < limit; index += 1) {
    const ingredient = ingredients[index];
    const encoded = encodeURIComponent(ingredient);
    const baseDomain = domain === "cosmetic" ? "world.openbeautyfacts.org" : "world.openfoodfacts.org";
    const url = `https://${baseDomain}/cgi/search.pl?search_terms=${encoded}&search_simple=1&json=1&page_size=1`;

    try {
      const data = await fetch_json(url, { "User-Agent": "Lablr-Agent" });
      records.push({ ingredient, source: baseDomain, data });
    } catch (error) {
      console.warn(`explainIngredients: external fetch failed for ${ingredient}`, error);
    }
  }

  return records;
}

function normalizeRiskLevel(value: unknown): ExplanationItem["risk_level"] {
  if (value === "Green" || value === "Yellow" || value === "Red" || value === "Unknown") {
    return value;
  }
  return "Unknown";
}

function normalizeCertainty(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number.parseFloat(value.toFixed(3));
}

function normalizeItems(raw: unknown): ExplanationItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return undefined;
      }
      const item = entry as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name : "Unknown";
      const fn = typeof item.function === "string" ? item.function : "";
      const why = typeof item.why === "string" ? item.why : "";
      const sources = Array.isArray(item.sources)
        ? item.sources.filter((source): source is string => typeof source === "string" && source.trim().length > 0)
        : [];

      return {
        name,
        function: fn,
        risk_level: normalizeRiskLevel(item.risk_level),
        why,
        certainty: normalizeCertainty(item.certainty),
        sources,
      };
    })
    .filter((item): item is ExplanationItem => Boolean(item));
}

export async function explainIngredients(data: OCRResult): Promise<ExplanationResult> {
  const apiKey = process.env.INTERFAZE_API_KEY;
  if (!apiKey) {
    console.warn("explainIngredients: INTERFAZE_API_KEY not set; returning fallback result");
    return { ...DEFAULT_RESULT };
  }

  const [glossary, rules] = await Promise.all([
    readJsonFile<GlossaryEntry[]>("mini_glossary.json", []),
    readJsonFile<RiskRule[]>("risk_rules.json", []),
  ]);

  const glossaryMatches = matchGlossaryEntries(data.ingredients, glossary);
  const riskMatches = applyRiskRules(data.ingredients, rules);
  const externalRecords = await fetchExternalRecords(data.ingredients, data.domain_guess);

  const apiBase = (process.env.INTERFAZE_API_BASE || "https://api.interfaze.ai/v1").replace(/\/$/, "");

  const context = {
    product: {
      domain_guess: data.domain_guess,
      sections: data.sections,
      confidence: data.confidence,
    },
    ingredients: data.ingredients,
    glossary_matches: glossaryMatches,
    risk_matches: riskMatches,
    external_records: externalRecords,
  };

  const modelsToTry = Array.from(
    new Set(
      [
        (process.env.INTERFAZE_EXPLAIN_MODEL || "").trim(),
        (process.env.INTERFAZE_OCR_MODEL || "").trim(),
        "interfaze-beta",
      ].filter((value): value is string => value.length > 0),
    ),
  );

  const contextMessage = [
    "Use the provided context to explain each ingredient for a layperson. Cite sources from OFF/OBF or kb: entries.",
    `Context JSON:\n${JSON.stringify(context, null, 2)}`,
  ].join("\n\n");

  const buildRequestBody = (model: string) => ({
    model,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "explanation_result",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  function: { type: "string" },
                  risk_level: { type: "string", enum: ["Green", "Yellow", "Red", "Unknown"] },
                  why: { type: "string" },
                  certainty: { type: "number", minimum: 0, maximum: 1 },
                  sources: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                  },
                },
                required: ["name", "function", "risk_level", "why", "certainty", "sources"],
              },
            },
            disclaimer: { type: "string" },
          },
          required: ["summary", "items", "disclaimer"],
        },
      },
    },
    messages: [
      {
        role: "system" as const,
        content: SYSTEM_PROMPT,
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: contextMessage,
          },
        ],
      },
    ],
  });

  const startedAt = Date.now();
  let response: Response | null = null;
  let lastStatus: number | null = null;
  let lastErrorText = "";

  for (const candidate of modelsToTry) {
    const attempt = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(candidate)),
    });

    if (attempt.ok) {
      response = attempt;
      break;
    }

    lastStatus = attempt.status;
    lastErrorText = await attempt.text().catch(() => "");
    console.warn(`explainIngredients: model ${candidate} failed with ${attempt.status}: ${lastErrorText}`);

    if ((attempt.status === 400 || attempt.status === 422) && candidate !== "interfaze-beta") {
      continue;
    }
  }

  if (!response || !response.ok) {
    const status = lastStatus ?? response?.status ?? 500;
    throw new Error(`explainIngredients: Interfaze API error ${status}: ${lastErrorText}`);
  }

  const payload = (await response.json()) as Record<string, unknown> & {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string; output_text?: string }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const elapsed = Date.now() - startedAt;
  if (process.env.NODE_ENV !== "production") {
    const usage = payload.usage || {};
    console.debug(
      `explainIngredients: usage prompt=${usage.prompt_tokens ?? "n/a"} completion=${usage.completion_tokens ?? "n/a"} total=${usage.total_tokens ?? "n/a"} elapsed=${elapsed}ms`,
    );
  }

  const message = payload?.choices?.[0]?.message;
  let content = "";

  if (message) {
    if (typeof message.content === "string") {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      for (const chunk of message.content) {
        if (typeof chunk?.output_text === "string") {
          content = chunk.output_text;
          break;
        }
        if (typeof chunk?.text === "string") {
          content = chunk.text;
          break;
        }
      }
    }
  }

  if (!content) {
    return { ...DEFAULT_RESULT };
  }

  let rawResult: Record<string, unknown>;
  try {
    rawResult = JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    console.warn("explainIngredients: failed to parse JSON response", error);
    return { ...DEFAULT_RESULT };
  }

  const summary = typeof rawResult.summary === "string" ? rawResult.summary : DEFAULT_RESULT.summary;
  const disclaimer =
    typeof rawResult.disclaimer === "string" ? rawResult.disclaimer : DEFAULT_RESULT.disclaimer;
  const items = normalizeItems(rawResult.items);

  return {
    summary,
    items,
    disclaimer,
  };
}

