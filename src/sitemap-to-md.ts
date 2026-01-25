#!/usr/bin/env node

import fs from "fs";
import path from "path";
import TurndownService from "turndown";
import minimist from "minimist";
import dotenv from "dotenv";
import { processSitemap, fetchUrl, filterUrls } from "./sitemap-utils.js";

// Load environment variables
const scriptDir = __dirname || path.dirname(process.argv[1]);
dotenv.config({ path: path.join(scriptDir, ".env") });

interface CliArgs {
  input?: string;
  output?: string;
  engine?: "fetch" | "jina";
  "title-type"?: "page" | "url";
  "target-selector"?: string;
  "remove-selector"?: string;
  "jina-api-key"?: string;
  "include-pattern"?: string | string[];
  "exclude-pattern"?: string | string[];
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: sitemap-to-md -i <sitemap.(xml|json|url)> -o <directorio-salida> [opciones]",
  );
  console.error("\nOpciones Generales:");
  console.error(
    "  -i --input            Sitemap XML, JSON con {urls: string[]}, o URL",
  );
  console.error(
    "  -o --output           Directorio donde guardar los .md generados",
  );
  console.error(
    "  --engine              Motor de extracción: 'fetch' (default) o 'jina'",
  );
  console.error(
    "  --title-type          Tipo de título: 'page' (título de la página) o 'url' (segmento URL) [default: page]",
  );
  console.error(
    "                        Nota: Si es 'url', se añade automáticamente un prefijo numérico.",
  );
  console.error(
    "  --include-pattern     Texto para filtrar URLs que incluyan el patrón (puede repetirse)",
  );
  console.error(
    "  --exclude-pattern     Texto para excluir URLs que coincidan con el patrón (puede repetirse)",
  );

  console.error("\nOpciones Jina Engine:");
  console.error(
    "  --target-selector     Selectores CSS a incluir (ej: 'main, #content')",
  );
  console.error(
    "  --remove-selector     Selectores CSS a excluir (ej: 'header, .ads, #footer')",
  );
  console.error(
    "  --jina-api-key        API Key de Jina (opcional si existe JINA_API_KEY en .env)",
  );
  process.exit(exitCode);
}

function parseArgs(): {
  inputPath: string;
  outDir: string;
  engine: "fetch" | "jina";
  titleType: "page" | "url";
  targetSelector?: string;
  removeSelector?: string;
  jinaApiKey?: string;
  includePatterns: string | string[];
  excludePatterns: string | string[];
} {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: "input", o: "output", h: "help" },
    string: [
      "input",
      "output",
      "engine",
      "title-type",
      "target-selector",
      "remove-selector",
      "jina-api-key",
      "include-pattern",
      "exclude-pattern",
    ],
    boolean: ["help"],
  });

  if (argv.help || !argv.input || !argv.output) {
    printUsage(argv.help ? 0 : 1);
  }

  const engine = argv.engine || "fetch";
  if (engine !== "fetch" && engine !== "jina") {
    console.error(
      `Error: engine debe ser 'fetch' o 'jina', recibido: '${engine}'`,
    );
    process.exit(1);
  }

  const titleType = argv["title-type"] || "page";
  if (titleType !== "page" && titleType !== "url") {
    console.error(
      `Error: title-type debe ser 'page' o 'url', recibido: '${titleType}'`,
    );
    process.exit(1);
  }

  return {
    inputPath: argv.input!,
    outDir: argv.output!,
    engine,
    titleType,
    targetSelector: argv["target-selector"],
    removeSelector: argv["remove-selector"],
    jinaApiKey: argv["jina-api-key"],
    includePatterns: argv["include-pattern"] || [],
    excludePatterns: argv["exclude-pattern"] || [],
  };
}

// Configurar Turndown (para engine: fetch)
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// --- HELPER FUNCTIONS ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extraer título del HTML (para engine: fetch)
function extractTitleFromHtml(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  return null;
}

// Extraer body del HTML (para engine: fetch)
function extractBodyFromHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

// Obtener último segmento de URL
function getLastUrlSegment(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname
      .split("/")
      .filter((segment) => segment.length > 0);
    if (segments.length > 0) {
      let lastSegment = segments[segments.length - 1];
      // Remover extensión si existe
      lastSegment = lastSegment.replace(/\.[^/.]+$/, "");
      return lastSegment || "index";
    }
    return "index";
  } catch {
    return "untitled";
  }
}

// Sanitizar título de página para nombre de archivo
function sanitizeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
      .replace(/[^a-z0-9\s-]/g, "-") // Reemplazar caracteres especiales con guiones
      .replace(/\s+/g, "-") // Espacios a guiones
      .replace(/-+/g, "-") // Múltiples guiones a uno solo
      .replace(/^-+|-+$/g, "") // Eliminar guiones al inicio y final
      .slice(0, 100) || "untitled"
  );
}

// Determinar nombre de archivo final
function determineFilename(
  url: string,
  pageTitle: string | null,
  titleType: "page" | "url",
  index: number,
  total: number,
): string {
  let baseFilename: string;

  if (titleType === "page") {
    baseFilename = sanitizeFilename(pageTitle || "untitled");
    // Fallback si el título es inválido/vacío
    if (baseFilename === "untitled") {
      baseFilename = getLastUrlSegment(url);
    }
  } else {
    baseFilename = getLastUrlSegment(url);
  }

  // Si titleType es 'url', aplicamos prefijo numérico automáticamente
  if (titleType === "url") {
    const paddingWidth = total.toString().length;
    const paddedIndex = (index + 1).toString().padStart(paddingWidth, "0");
    return `${paddedIndex}-${baseFilename}`;
  }

  return baseFilename;
}

// --- JINA ENGINE LOGIC ---

async function scrapeWithJina(
  url: string,
  apiKey: string,
  targetSelector?: string,
  removeSelector?: string,
): Promise<{ content: string; title: string }> {
  const requestUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "X-Md-Link-Style": "discarded",
    "X-Md-Heading-Style": "atx",
  };

  if (targetSelector) headers["X-Target-Selector"] = targetSelector;
  if (removeSelector) headers["X-Remove-Selector"] = removeSelector;

  const response = await fetch(requestUrl, { headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const textResponse = await response.text();

  // Parsear respuesta de Jina
  const titleMatch = textResponse.match(/^Title:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "untitled";

  const markdownContentMatch = textResponse.match(
    /Markdown Content:\s*\n([\s\S]*)/i,
  );
  const content = markdownContentMatch
    ? `# ${title}\n\n${markdownContentMatch[1].trim()}`
    : textResponse;

  return { content, title };
}

// --- MAIN ---

async function main(): Promise<void> {
  const args = parseArgs();
  const {
    inputPath,
    outDir,
    engine,
    titleType,
    targetSelector,
    removeSelector,
    jinaApiKey,
    includePatterns,
    excludePatterns,
  } = args;

  const outDirFullPath = path.isAbsolute(outDir)
    ? outDir
    : path.join(process.cwd(), outDir);

  // Validar API Key si se usa Jina
  let finalJinaKey = "";
  if (engine === "jina") {
    finalJinaKey = jinaApiKey || process.env.JINA_API_KEY || "";
    if (!finalJinaKey) {
      console.error(
        "Error: JINA_API_KEY es requerida para el motor Jina. Úsala en .env o como argumento.",
      );
      process.exit(1);
    }
  }

  console.log(`Procesando sitemap: ${inputPath} [Engine: ${engine}]`);

  // Procesar Sitemap
  let result;
  try {
    result = await processSitemap(inputPath);
  } catch (err) {
    console.error(`Error al procesar el sitemap: ${(err as Error).message}`);
    process.exit(1);
  }

  const { urls } = result;
  if (urls.length === 0) {
    console.error("No se encontraron URLs en el sitemap");
    process.exit(1);
  }

  console.log(`Fuente detectada: ${result.source}`);

  // Filtrar URLs
  const { filteredUrls } = filterUrls(urls, includePatterns, excludePatterns);
  const finalUrls = filteredUrls;

  if (finalUrls.length === 0) {
    console.error("No quedan URLs después de filtrar");
    process.exit(1);
  }

  // Crear directorio
  if (!fs.existsSync(outDirFullPath)) {
    fs.mkdirSync(outDirFullPath, { recursive: true });
  }

  console.log(`Procesando ${finalUrls.length} URLs...`);

  let successCount = 0;
  let errorCount = 0;

  // Lógica de procesamiento según engine
  if (engine === "jina") {
    // Jina: Procesamiento concurrente en lotes
    const BATCH_SIZE = 50;
    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size)
        chunks.push(arr.slice(i, i + size));
      return chunks;
    };

    const urlChunks = chunkArray(finalUrls, BATCH_SIZE);

    for (let chunkIndex = 0; chunkIndex < urlChunks.length; chunkIndex++) {
      const chunk = urlChunks[chunkIndex];
      const startIndex = chunkIndex * BATCH_SIZE;

      console.log(
        `\n📦 Procesando lote ${chunkIndex + 1}/${urlChunks.length} (${chunk.length} URLs)...`,
      );

      const results = await Promise.all(
        chunk.map(async (url, i) => {
          const currentIndex = startIndex + i;
          try {
            console.log(
              `[${currentIndex + 1}/${finalUrls.length}] Procesando: ${url}`,
            );
            const { content, title } = await scrapeWithJina(
              url,
              finalJinaKey,
              targetSelector,
              removeSelector,
            );

            const filename = determineFilename(
              url,
              title,
              titleType,
              currentIndex,
              finalUrls.length,
            );
            const filePath = path.join(outDirFullPath, `${filename}.md`);
            fs.writeFileSync(filePath, content, "utf8");

            console.log(`  ✓ Guardado: ${filename}.md`);
            return true;
          } catch (err) {
            console.error(`  ✗ Error en ${url}: ${(err as Error).message}`);
            return false;
          }
        }),
      );

      results.forEach((success) => {
        if (success) successCount++;
        else errorCount++;
      });
    }
  } else {
    // Fetch: Procesamiento secuencial (con delay)
    for (let i = 0; i < finalUrls.length; i++) {
      const url = finalUrls[i];
      console.log(`[${i + 1}/${finalUrls.length}] Descargando: ${url}`);

      try {
        const html = await fetchUrl(url);
        const title = extractTitleFromHtml(html);
        const body = extractBodyFromHtml(html);
        let markdown = turndownService.turndown(body);

        // Add title to markdown content if not present
        if (title) {
          markdown = `# ${title}\n\n${markdown}`;
        }

        const filename = determineFilename(
          url,
          title,
          titleType,
          i,
          finalUrls.length,
        );
        const filePath = path.join(outDirFullPath, `${filename}.md`);
        fs.writeFileSync(filePath, markdown, "utf8");

        console.log(`  ✓ Guardado: ${filename}.md`);
        successCount++;
      } catch (err) {
        console.error(`  ✗ Error: ${(err as Error).message}`);
        errorCount++;
      }

      if (i < finalUrls.length - 1) {
        await delay(50);
      }
    }
  }

  console.log(
    `\n✅ Completado: ${successCount} exitosos, ${errorCount} errores`,
  );
}

main().catch((err) => {
  console.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
