export type OCRResult = {
  domain_guess: "food" | "drug" | "cosmetic" | "mixed";
  ingredients: string[];
  sections: { warnings?: string; claims?: string[] };
  confidence: number;
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
  "English only."
].join(" ");

const DEFAULT_RESULT: OCRResult = {
  domain_guess: "mixed",
  ingredients: [],
  sections: {},
  confidence: 0,
};

function extractMessageContent(payload: ChatCompletionResponse): string {
  const message = payload?.choices?.[0]?.message;
  if (!message) {
    return "";
  }

  const { content } = message;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    for (const chunk of content) {
      if (typeof chunk?.output_text === "string") {
        return chunk.output_text;
      }
      if (typeof chunk?.text === "string") {
        return chunk.text;
      }
    }
  }

  return "";
}

function normalizeIngredients(raw: unknown): string[] {
  if (!raw) {
    return [];
  }

  const items = Array.isArray(raw) ? raw : [raw];
  const collected: string[] = [];

  for (const entry of items) {
    if (typeof entry !== "string") {
      continue;
    }

    const splits = entry
      .split(/[\n•]/)
      .flatMap((segment) => segment.split(/[;,]/))
      .map((segment) => segment.trim().toLowerCase())
      .filter((segment) => segment.length > 0);

    collected.push(...splits);
  }

  return Array.from(new Set(collected));
}

function normalizeSections(raw: unknown): OCRResult["sections"] {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const maybeSections = raw as Record<string, unknown>;
  const sections: OCRResult["sections"] = {};

  if (typeof maybeSections.warnings === "string" && maybeSections.warnings.trim().length > 0) {
    sections.warnings = maybeSections.warnings.trim();
  }

  if (Array.isArray(maybeSections.claims)) {
    const claims = maybeSections.claims
      .filter((claim): claim is string => typeof claim === "string" && claim.trim().length > 0)
      .map((claim) => claim.trim());

    if (claims.length > 0) {
      sections.claims = claims;
    }
  }

  return sections;
}

function normalizeDomain(domain: unknown): OCRResult["domain_guess"] {
  if (domain === "food" || domain === "drug" || domain === "cosmetic" || domain === "mixed") {
    return domain;
  }
  return "mixed";
}

function normalizeConfidence(value: unknown): number {
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

  const requestBody = {
    model: process.env.INTERFAZE_OCR_MODEL || "interfaze-vocr-latest",
    temperature: 0.1,
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
          },
          required: ["domain_guess", "ingredients", "sections", "confidence"],
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
            type: "input_text" as const,
            text: "Analyze this product label image. Extract only the visible ingredients, warnings, and marketing claims. Return the JSON schema exactly.",
          },
          {
            type: "input_image" as const,
            image_url,
          },
        ],
      },
    ],
  };

  const startedAt = Date.now();

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`analyzeLabel: Interfaze API error ${response.status}: ${errorText}`);
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
  if (!content) {
    return { ...DEFAULT_RESULT };
  }

  let rawResult: Record<string, unknown> | undefined;
  try {
    rawResult = JSON.parse(content);
  } catch (error) {
    console.warn("analyzeLabel: failed to parse JSON response", error);
    return { ...DEFAULT_RESULT };
  }

  const result: OCRResult = {
    domain_guess: normalizeDomain(rawResult?.domain_guess),
    ingredients: normalizeIngredients(rawResult?.ingredients),
    sections: normalizeSections(rawResult?.sections),
    confidence: normalizeConfidence(rawResult?.confidence),
  };

  if (result.ingredients.length === 0) {
    result.confidence = Math.min(result.confidence, 0.2);
  }

  return result;
}
