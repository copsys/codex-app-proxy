import { homedir } from "os";
import { join } from "path";
import { readFile } from "fs/promises";

export interface ModelFeature {
  effort?: string;
  description?: string;
}

export interface CodexModel {
  slug: string;
  display_name: string;
  description: string;
  default_reasoning_level?: string;
  supported_reasoning_levels?: ModelFeature[];
  context_window?: number;
}

// Fallback models in case the models_cache.json cannot be read
const FALLBACK_MODELS: CodexModel[] = [
  {
    slug: "gpt-5.3-codex",
    display_name: "gpt-5.3-codex",
    description: "Latest frontier agentic coding model.",
    context_window: 272000,
  },
  {
    slug: "gpt-4o",
    display_name: "gpt-4o",
    description:
      "General purpose model (Note: May not be supported depending on account type).",
    context_window: 128000,
  },
  {
    slug: "o1",
    display_name: "o1",
    description: "Optimized reasoning model.",
    context_window: 200000,
  },
];

export async function getAvailableModels(): Promise<CodexModel[]> {
  try {
    const codexDir = join(homedir(), ".codex");
    const cachePath = join(codexDir, "models_cache.json");

    const data = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(data);

    if (parsed && Array.isArray(parsed.models)) {
      return parsed.models;
    }
  } catch (error) {
    console.warn(
      "[Proxy] Failed to read models_cache.json, using fallback models.",
      (error as any).message,
    );
  }

  return FALLBACK_MODELS;
}
