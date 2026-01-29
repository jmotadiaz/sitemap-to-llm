import fs from "fs";
import path from "path";
import TurndownService from "turndown";
import FirecrawlApp from "@mendable/firecrawl-js";
import pThrottle from "p-throttle";
import {
  processSitemap,
  fetchUrl,
  filterUrls,
  delay,
  extractTitleFromHtml,
  extractBodyFromHtml,
  determineFilename,
} from "./sitemap-utils.js";

export interface SitemapToMdOptions {
  inputPath: string;
  outDir: string;
  engine?: "fetch" | "jina" | "firecrawl";
  titleType?: "page" | "url";
  targetSelector?: string;
  removeSelector?: string;
  jinaApiKey?: string;
  firecrawlApiKey?: string;
  includePatterns?: string | string[];
  excludePatterns?: string | string[];
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

interface ScrapeEngine {
  process(
    urls: string[],
    outDirFullPath: string,
    options: SitemapToMdOptions,
  ): Promise<{ success: number; error: number }>;
}

class FetchEngine implements ScrapeEngine {
  async process(
    urls: string[],
    outDirFullPath: string,
    options: SitemapToMdOptions,
  ): Promise<{ success: number; error: number }> {
    let successCount = 0;
    let errorCount = 0;
    const { titleType = "page" } = options;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}] Descargando: ${url}`);

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
          urls.length,
        );
        const filePath = path.join(outDirFullPath, `${filename}.md`);
        fs.writeFileSync(filePath, markdown, "utf8");

        console.log(`  ✓ Guardado: ${filename}.md`);
        successCount++;
      } catch (err) {
        console.error(`  ✗ Error: ${(err as Error).message}`);
        errorCount++;
      }

      if (i < urls.length - 1) {
        await delay(50);
      }
    }
    return { success: successCount, error: errorCount };
  }
}

class JinaEngine implements ScrapeEngine {
  private async scrapeWithJina(
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

  async process(
    urls: string[],
    outDirFullPath: string,
    options: SitemapToMdOptions,
  ): Promise<{ success: number; error: number }> {
    let successCount = 0;
    let errorCount = 0;
    const {
      titleType = "page",
      jinaApiKey,
      targetSelector,
      removeSelector,
    } = options;
    const finalJinaKey = jinaApiKey || process.env.JINA_API_KEY || "";

    if (!finalJinaKey) {
      throw new Error("JINA_API_KEY es requerida para el motor Jina.");
    }

    const BATCH_SIZE = 50;
    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size)
        chunks.push(arr.slice(i, i + size));
      return chunks;
    };

    const urlChunks = chunkArray(urls, BATCH_SIZE);

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
              `[${currentIndex + 1}/${urls.length}] Procesando: ${url}`,
            );
            const { content, title } = await this.scrapeWithJina(
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
              urls.length,
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
    return { success: successCount, error: errorCount };
  }
}

class FirecrawlEngine implements ScrapeEngine {
  async process(
    urls: string[],
    outDirFullPath: string,
    options: SitemapToMdOptions,
  ): Promise<{ success: number; error: number }> {
    let successCount = 0;
    let errorCount = 0;
    const { titleType = "page", firecrawlApiKey } = options;
    const apiKey = firecrawlApiKey || process.env.FIRECRAWL_API_KEY || "";

    if (!apiKey) {
      throw new Error(
        "FIRECRAWL_API_KEY es requerida para el motor Firecrawl.",
      );
    }

    const firecrawl = new (FirecrawlApp as any)({ apiKey });

    const throttle = pThrottle({
      limit: 10,
      interval: 61000,
    });

    const throttledScrape = throttle(async (url: string) => {
      const scrapeOptions: any = {
        formats: ["markdown"],
        onlyMainContent: true,
      };

      if (options.targetSelector) {
        scrapeOptions.includeTags = options.targetSelector
          .split(",")
          .map((s) => s.trim());
      }

      if (options.removeSelector) {
        scrapeOptions.excludeTags = options.removeSelector
          .split(",")
          .map((s) => s.trim());
      }

      return await firecrawl.scrapeUrl(url, scrapeOptions);
    });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}] Procesando con Firecrawl: ${url}`);

      try {
        const response = await throttledScrape(url);

        if (!response.success) {
          throw new Error(
            response.error || "Error desconocido al scrapear con Firecrawl",
          );
        }

        const title =
          response.metadata?.title ||
          extractTitleFromHtml(response.html || "") ||
          "untitled";
        const content = response.markdown || "";

        const finalContent = `# ${title}\n\n${content}`;

        const filename = determineFilename(
          url,
          title,
          titleType,
          i,
          urls.length,
        );
        const filePath = path.join(outDirFullPath, `${filename}.md`);
        fs.writeFileSync(filePath, finalContent, "utf8");

        console.log(`  ✓ Guardado: ${filename}.md`);
        successCount++;
      } catch (err) {
        console.error(`  ✗ Error en ${url}: ${(err as Error).message}`);
        errorCount++;
      }
    }

    return { success: successCount, error: errorCount };
  }
}

export async function sitemapToMd(options: SitemapToMdOptions): Promise<void> {
  const {
    inputPath,
    outDir,
    engine = "fetch",
    includePatterns = [],
    excludePatterns = [],
  } = options;

  const outDirFullPath = path.isAbsolute(outDir)
    ? outDir
    : path.join(process.cwd(), outDir);

  let scraper: ScrapeEngine;
  switch (engine) {
    case "jina":
      scraper = new JinaEngine();
      break;
    case "firecrawl":
      scraper = new FirecrawlEngine();
      break;
    case "fetch":
    default:
      scraper = new FetchEngine();
      break;
  }

  console.log(`Procesando sitemap: ${inputPath} [Engine: ${engine}]`);

  let result;
  try {
    result = await processSitemap(inputPath);
  } catch (err) {
    throw new Error(`Error al procesar el sitemap: ${(err as Error).message}`);
  }

  const { urls } = result;
  if (urls.length === 0) {
    throw new Error("No se encontraron URLs en el sitemap");
  }

  console.log(`Fuente detectada: ${result.source}`);
  const { filteredUrls } = filterUrls(urls, includePatterns, excludePatterns);

  if (filteredUrls.length === 0) {
    throw new Error("No quedan URLs después de filtrar");
  }

  if (!fs.existsSync(outDirFullPath)) {
    fs.mkdirSync(outDirFullPath, { recursive: true });
  }

  console.log(`Procesando ${filteredUrls.length} URLs...`);

  const { success, error } = await scraper.process(
    filteredUrls,
    outDirFullPath,
    options,
  );

  console.log(`\n✅ Completado: ${success} exitosos, ${error} errores`);
}
