# Label Simplified

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)&nbsp;![Mastra Agents](https://img.shields.io/badge/Mastra-agents-6c47ff?logo=sparkles&logoColor=fff)&nbsp;![MIT License](https://img.shields.io/badge/license-MIT-green)

## Overview
Label Simplified is a web app that lets you drop in a product label photo and quickly get a plain-English readout of the ingredients, warnings, and safety notes. It uses a coordinated set of lightweight AI helpers so the workflow stays familiar for developers while the experience remains friendly for anyone curious about what’s on the label.

## Features
- Vision OCR agent that extracts ingredients, warnings, and claims with schema-constrained outputs.
- Explanation agent that merges local heuristics, glossary lookups, and optional OpenFoodFacts/OpenBeautyFacts fetches.
- Drag-and-drop web UI featuring progress tracking, risk badges, and structured results.
- File upload pipeline with automatic Interfaze hosting fallback to in-memory data URLs.
- TypeScript-first codebase with strict linting and shared utilities under `@/tools` and `@ui/*` aliases.

## Architecture
- `agent/ocr.ts`: Talks to Interfaze's vision completion endpoint and normalizes the payload.
- `agent/explain.ts`: Generates ingredient summaries using local data (`mcp/file-server`) and optional external fetches.
- `src/app`: Next.js App Router entry point, API route, and UI wiring.
- `ui/components`: Reusable client components for upload, progress steps, and results tables.
- `mcp`: Minimal content provider assets (glossary, risk rules) served to the explanation agent.

## Tech Stack
- Next.js App Router (React 19) with TypeScript and Tailwind CSS v4.
- Mastra 0.13.x agent runtime powering the multi-tool orchestration.
- Interfaze VOCR for high-quality vision language modeling.
- LibSQL bindings prepared for persistence experiments (optional).

## Getting Started
1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Configure environment**
   Create `.env.local` (UI) and `.env` (agent) as needed:
   ```bash
   INTERFAZE_API_KEY="sk-..."
   INTERFAZE_API_BASE="https://api.interfaze.ai/v1" # optional override
   INTERFAZE_OCR_MODEL="interfaze-beta"             # optional override
   WEB_FETCH_ENABLED="true"                         # enable external lookups
   OFF_FETCH_LIMIT="3"                              # cap external fetches per run
   ```
3. **Run the stack**
   ```bash
   pnpm dev:agent    # starts Mastra agent dev server (default :4111)
   pnpm dev:ui       # launches Next.js dev server (default :3000)
   ```
   Or run both with `pnpm start` once built.

## Useful Scripts
- `pnpm build`: Compile agent + Next.js for production.
- `pnpm start`: Run both agent and UI in production mode.
- `pnpm lint`: Lint the TypeScript/React sources.

## Testing The Flow
- Upload a product label image through the UI, or call `POST /api/analyze` with `{ "image_url": "..." }`.
- Watch the console for warnings when environment variables are missing—agents gracefully downgrade to safe defaults.

## Troubleshooting
- **Empty OCR results**: Ensure `INTERFAZE_API_KEY` is present; otherwise, the OCR agent returns a stub.
- **Slow explanations**: Disable `WEB_FETCH_ENABLED` to skip external data sources.
- **Large images rejected**: The API route limits uploads to 5 MB and common raster formats.

## License
Distributed under the MIT License. See `LICENSE` for details.
