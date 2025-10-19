import { NextRequest, NextResponse } from "next/server";
import { analyzeLabel } from "@/agent/ocr";
import { explainIngredients } from "@/agent/explain";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function readFileFromRequest(request: NextRequest): Promise<{ buffer: Buffer; mime: string } | null> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) {
    return null;
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return null;
  }

  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File too large. Maximum size is 5 MB.");
  }

  const arrayBuffer = await file.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mime: file.type,
  };
}

async function uploadToInterfaze(file: { buffer: Buffer; mime: string }): Promise<string> {
  const apiBase = (process.env.INTERFAZE_API_BASE || "https://api.interfaze.ai/v1").replace(/\/$/, "");
  const apiKey = process.env.INTERFAZE_API_KEY;

  if (!apiKey) {
    throw new Error("Interfaze credentials missing");
  }

  const response = await fetch(`${apiBase}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: (() => {
      const form = new FormData();
      form.append("purpose", "vision");

      const buf: Buffer = file.buffer as unknown as Buffer;
      const extension = MIME_EXTENSION[file.mime] || "bin";
      const filename = `upload-${Date.now()}.${extension}`;
      const blob = new Blob([buf], { type: file.mime });
      form.append("file", blob, filename);
      return form;
    })(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`File upload failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as { id?: string; url?: string };
  if (payload.url) {
    return payload.url;
  }
  if (payload.id) {
    return `${apiBase}/files/${payload.id}`;
  }
  throw new Error("Interfaze file upload response missing url");
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let imageUrl: string | undefined;

    if (contentType.startsWith("application/json")) {
      const { image_url } = (await request.json()) as { image_url?: string };
      if (typeof image_url === "string" && image_url.trim().length > 0) {
        imageUrl = image_url.trim();
      }
    } else {
      const file = await readFileFromRequest(request);
      if (file) {
        imageUrl = await uploadToInterfaze(file);
      }
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "image_url or image file is required" }, { status: 400 });
    }

    const ocrResult = await analyzeLabel(imageUrl);
    const explanation = await explainIngredients(ocrResult);

    return NextResponse.json({
      ocr: ocrResult,
      explanation,
    });
  } catch (error) {
    console.error("/api/analyze", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
