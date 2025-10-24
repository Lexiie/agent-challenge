export type OCRResult = {
  domain_guess: "food" | "drug" | "cosmetic" | "mixed";
  ingredients: string[];
  sections: { warnings?: string; claims?: string[] };
  confidence: number;
  language: string;
};

type ChatCompletionResponse = {
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

const SYSTEM_PROMPT = [
  "Extract only what appears on the label.",
  "Output OCRResult strictly in JSON.",
  "Do not invent ingredients.",
  "Low temperature.",
  "Detect the predominant label language and include it as a BCP-47 tag in the language field.",
].join(" ");

const DEFAULT_RESULT: OCRResult = {
  domain_guess: "mixed",
  ingredients: [],
  sections: {},
  confidence: 0,
  language: "en",
};

function extractMessageContent(payload: ChatCompletionResponse): string {
  const message = payload?.choices?.[0]?.message;
  if (!message) return "";

  const { content } = message;
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    for (const chunk of content) {
      if (typeof chunk?.output_text === "string") return chunk.output_text;
      if (typeof chunk?.text === "string") return chunk.text;
    }
  }
  return "";
}

function normalizeIngredients(raw: unknown): string[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  const collected: string[] = [];

  for (const entry of items) {
    if (typeof entry !== "string") continue;
    const splits = entry
      .split(/[\n•]/)
      .flatMap((s) => s.split(/[;,]/))
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    collected.push(...splits);
  }

  return Array.from(new Set(collected));
}

function normalizeSections(raw: unknown): OCRResult["sections"] {
  if (!raw || typeof raw !== "object") return {};
  const maybeSections = raw as Record<string, unknown>;
  const sections: OCRResult["sections"] = {};

  if (typeof maybeSections.warnings === "string" && maybeSections.warnings.trim())
    sections.warnings = maybeSections.warnings.trim();

  if (Array.isArray(maybeSections.claims)) {
    const claims = maybeSections.claims
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim());
    if (claims.length > 0) sections.claims = claims;
  }

  return sections;
}

function normalizeDomain(domain: unknown): OCRResult["domain_guess"] {
  return domain === "food" || domain === "drug" || domain === "cosmetic" || domain === "mixed"
    ? domain
    : "mixed";
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number.parseFloat(value.toFixed(3));
}

function normalizeLanguage(value: unknown): string {
  if (typeof value !== "string") return "en";
  const trimmed = value.trim();
  if (!trimmed) return "en";
  const lower = trimmed.toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(lower) ? lower : "en";
}

export async function analyzeLabel(image_url: string): Promise<OCRResult> {
  if (!image_url || typeof image_url !== "string") {
    throw new Error("analyzeLabel: image_url is required");
  }

  const apiBase = (process.env.INTERFAZE_API_BASE || "https://api.interfaze.ai/v1").replace(/\/$/, "");
  const apiKey = process.env.INTERFAZE_API_KEY;

  if (!apiKey) {
    console.warn("analyzeLabel: INTERFAZE_API_KEY is not set; returning empty OCR result");
    return { ...DEFAULT_RESULT };
  }

  const model = process.env.INTERFAZE_OCR_MODEL || "interfaze-beta";

  const baseBody = {
    model,
    temperature: 0.1,
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
            text: "Analyze this product label image. Extract only the visible ingredients, warnings, and marketing claims. Detect the primary language and populate the language field. Return the JSON schema exactly.",
          },
          {
            type: "image_url" as const,
            image_url: { url: image_url },
          },
        ],
      },
    ],
  };

  const schemaBody = {
    ...baseBody,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ocr_result",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            domain_guess: {
              type: "string",
              enum: ["food", "drug", "cosmetic", "mixed"],
            },
            ingredients: {
              type: "array",
              items: { type: "string" },
              default: [],
            },
            sections: {
              type: "object",
              additionalProperties: true,
              properties: {
                warnings: { type: "string" },
                claims: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              default: {},
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              default: 0,
            },
            language: {
              type: "string",
              description: "Detected label language as a BCP-47 tag (e.g., en, es, fr, id).",
              default: "en",
            },
          },
          required: ["domain_guess", "ingredients", "sections", "confidence", "language"],
        },
      },
    },
  };

  const startedAt = Date.now();

  // try with json_schema, fallback to json_object if unsupported
  let response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(schemaBody),
  });

  if (!response.ok && (response.status === 400 || response.status === 422)) {
    const jsonObjectBody = {
      ...baseBody,
      response_format: { type: "json_object" as const },
    };
    response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(jsonObjectBody),
    });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`analyzeLabel: Interfaze API error ${response.status}: ${errText}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;

  const elapsed = Date.now() - startedAt;
  if (process.env.NODE_ENV !== "production") {
    const p = payload?.usage?.prompt_tokens ?? "n/a";
    const c = payload?.usage?.completion_tokens ?? "n/a";
    const t = payload?.usage?.total_tokens ?? "n/a";
    console.debug(`analyzeLabel: usage prompt=${p} completion=${c} total=${t} elapsed=${elapsed}ms`);
  }

  const content = extractMessageContent(payload);
  if (!content) return { ...DEFAULT_RESULT };

  let raw: Record<string, unknown> | undefined;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    console.warn("analyzeLabel: failed to parse JSON response", err);
    return { ...DEFAULT_RESULT };
  }

  const result: OCRResult = {
    domain_guess: normalizeDomain(raw?.domain_guess),
    ingredients: normalizeIngredients(raw?.ingredients),
    sections: normalizeSections(raw?.sections),
    confidence: normalizeConfidence(raw?.confidence),
    language: normalizeLanguage(raw?.language),
  };

  if (result.ingredients.length === 0) {
    result.confidence = Math.min(result.confidence, 0.2);
  }

  return result;
}
