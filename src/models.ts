// GENERATED CODE! DO NOT MODIFY BY HAND!

import { homedir } from "os";
import { join } from "path";
import { readFile } from "fs/promises";

export interface CodexModel {
  slug: string;
  [key: string]: any;
}

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
    console.error(
      "[Proxy] Failed to read models_cache.json. Ensure Codex is installed and you've run it at least once.",
      (error as any).message,
    );
  }

  return [];
}
