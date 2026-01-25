import fs from "fs";
import path from "path";
import { processSitemap } from "./sitemap-utils.js";

export interface ExtractOptions {
  inputPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  outputPath?: string;
  format?: "json" | "txt";
}

interface JsonInput {
  urls: string[];
  container?: string;
  excludeSelectors?: string[];
}

export interface ExtractResult {
  content: string;
  outputPath: string;
  stats: {
    source: string;
    found: number;
    filtered: number;
    includedCount: number; // Count after include filter, before exclude filter
  };
}

export async function extractSitemap(options: ExtractOptions): Promise<ExtractResult> {
  const { inputPath, includePatterns = [], excludePatterns = [], outputPath = "sitemap.txt", format } = options;

  let outputFormat = format;
  if (!outputFormat) {
    const ext = path.extname(outputPath).toLowerCase();
    outputFormat = ext === ".json" ? "json" : "txt";
  }

  const result = await processSitemap(inputPath);

  // Primero aplicar includePatterns (si hay alguno)
  let filteredUrls =
    includePatterns.length > 0
      ? result.urls.filter((url) =>
          includePatterns.some((pattern) => url.includes(pattern))
        )
      : result.urls;

  const includedCount = filteredUrls.length;

  // Luego aplicar excludePatterns sobre el subconjunto
  if (excludePatterns.length > 0) {
    filteredUrls = filteredUrls.filter(
      (url) => !excludePatterns.some((pattern) => url.includes(pattern))
    );
  }

  // Leer container y excludeSelectors del archivo original si es JSON y es local
  let container: string | undefined;
  let excludeSelectors: string[] | undefined;

  try {
    // Basic check to avoid FS errors on URLs
    if (inputPath.toLowerCase().endsWith(".json") && !inputPath.startsWith('http')) {
      const fullPath = path.isAbsolute(inputPath)
        ? inputPath
        : path.join(process.cwd(), inputPath);

      if (fs.existsSync(fullPath)) {
        const originalContent = fs.readFileSync(fullPath, "utf8");
        const originalJson: JsonInput = JSON.parse(originalContent);
        container = originalJson.container;
        excludeSelectors = originalJson.excludeSelectors;
      }
    }
  } catch {
    // Ignorar errores al leer propiedades adicionales
  }

  let outputContent: string;
  if (outputFormat === "json") {
    const output: JsonInput = { urls: filteredUrls };
    if (container) output.container = container;
    if (excludeSelectors) output.excludeSelectors = excludeSelectors;
    outputContent = JSON.stringify(output, null, 2);
  } else {
    // formato txt: una URL por línea
    outputContent = filteredUrls.join("\n");
  }

  return {
    content: outputContent,
    outputPath,
    stats: {
      source: result.source,
      found: result.urls.length,
      filtered: filteredUrls.length,
      includedCount
    }
  };
}
