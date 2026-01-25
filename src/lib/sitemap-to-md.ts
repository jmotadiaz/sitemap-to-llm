import fs from "fs";
import path from "path";
import TurndownService from "turndown";
import { processSitemap, fetchUrl, filterUrls } from "./sitemap-utils.js";

export interface SitemapToMdOptions {
  inputPath: string;
  outDir: string;
  engine?: "fetch" | "jina";
  titleType?: "page" | "url";
  targetSelector?: string;
  removeSelector?: string;
  jinaApiKey?: string;
  includePatterns?: string | string[];
  excludePatterns?: string | string[];
}

// Configurar Turndown (para engine: fetch)
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTitleFromHtml(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  return null;
}

function extractBodyFromHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function getLastUrlSegment(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname
      .split("/")
      .filter((segment) => segment.length > 0);
    if (segments.length > 0) {
      let lastSegment = segments[segments.length - 1];
      lastSegment = lastSegment.replace(/\.[^/.]+$/, "");
      return lastSegment || "index";
    }
    return "index";
  } catch {
    return "untitled";
  }
}

function sanitizeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "untitled"
  );
}

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
    if (baseFilename === "untitled") {
      baseFilename = getLastUrlSegment(url);
    }
  } else {
    baseFilename = getLastUrlSegment(url);
  }

  if (titleType === "url") {
    const paddingWidth = total.toString().length;
    const paddedIndex = (index + 1).toString().padStart(paddingWidth, "0");
    return `${paddedIndex}-${baseFilename}`;
  }

  return baseFilename;
}

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

export async function sitemapToMd(options: SitemapToMdOptions): Promise<void> {
  const {
    inputPath,
    outDir,
    engine = "fetch",
    titleType = "page",
    targetSelector,
    removeSelector,
    jinaApiKey,
    includePatterns = [],
    excludePatterns = [],
  } = options;

  const outDirFullPath = path.isAbsolute(outDir)
    ? outDir
    : path.join(process.cwd(), outDir);

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

  const { filteredUrls } = filterUrls(urls, includePatterns, excludePatterns);
  const finalUrls = filteredUrls;

  if (finalUrls.length === 0) {
    console.error("No quedan URLs después de filtrar");
    process.exit(1);
  }

  if (!fs.existsSync(outDirFullPath)) {
    fs.mkdirSync(outDirFullPath, { recursive: true });
  }

  console.log(`Procesando ${finalUrls.length} URLs...`);

  let successCount = 0;
  let errorCount = 0;

  if (engine === "jina") {
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
    for (let i = 0; i < finalUrls.length; i++) {
      const url = finalUrls[i];
      console.log(`[${i + 1}/${finalUrls.length}] Descargando: ${url}`);

      try {
        const html = await fetchUrl(url);
        const title = extractTitleFromHtml(html);
        const body = extractBodyFromHtml(html);
        let markdown = turndownService.turndown(body);

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
