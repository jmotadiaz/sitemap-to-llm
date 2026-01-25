import fs from "fs";
import path from "path";
import TurndownService from "turndown";
import { load } from "cheerio";

const BATCH_SIZE = 10;

interface Composition {
  targetSelectors?: string[];
  targerSelectors?: string[]; // typo support
  removeSelectors?: string[];
  parents: string[];
  children: string[];
}

export interface CompositionToMarkdownOptions {
  inputPath: string;
  outDir: string;
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: "---",
});

turndownService.remove("script");

async function scrapeWithFetch(
  url: string,
  targetSelectors: string[],
  removeSelectors: string[]
): Promise<{ content: string; title: string }> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        title: "Error fetching",
        content: `Error fetching ${url}: HTTP ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    const $ = load(html);

    const title = $("title").text().trim() || "untitled";

    if (removeSelectors.length > 0) {
      removeSelectors.forEach((selector) => {
        $(selector).remove();
      });
    }

    let htmlToConvert = "";

    if (targetSelectors.length > 0) {
      const container = $("<div></div>");
      let foundAny = false;

      targetSelectors.forEach((selector) => {
        const elements = $(selector);
        if (elements.length > 0) {
          foundAny = true;
          elements.each((_, el) => {
            container.append($(el).clone());
          });
        }
      });

      if (foundAny) {
        htmlToConvert = container.html() || "";
      } else {
        htmlToConvert = "";
        console.warn(
          `    ⚠️ Warning: No content found for target selectors in ${url}`
        );
      }
    } else {
      htmlToConvert = $("body").html() || "";
    }

    let markdown = turndownService.turndown(htmlToConvert);

    if (title && title !== "untitled") {
      markdown = `# ${title}\n\n${markdown}`;
    }

    return { content: markdown, title };
  } catch (err) {
    return {
      title: "Connection Error",
      content: `Error fetching ${url}: ${(err as Error).message}`,
    };
  }
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
    return "unknown";
  }
}

export async function compositionToMarkdown(options: CompositionToMarkdownOptions): Promise<void> {
  const { inputPath, outDir } = options;

  const fullInputPath = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(process.cwd(), inputPath);

  if (!fs.existsSync(fullInputPath)) {
    console.error(`Error: No se encontró el archivo ${fullInputPath}`);
    process.exit(1);
  }

  const compositionContent = fs.readFileSync(fullInputPath, "utf-8");
  let composition: Composition;
  try {
    composition = JSON.parse(compositionContent);
  } catch (e) {
    console.error("Error al parsear el JSON de entrada");
    process.exit(1);
  }

  const targets =
    composition.targetSelectors || composition.targerSelectors || [];
  const removes = composition.removeSelectors || [];

  console.log(`Cargado composition.json`);
  console.log(`Parents: ${composition.parents.length}`);
  console.log(`Children totales: ${composition.children.length}`);
  console.log(`Target Selectors: ${targets.join(", ")}`);
  console.log(`Remove Selectors: ${removes.join(", ")}`);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const [index, parentUrl] of composition.parents.entries()) {
    console.log(
      `\n[${index + 1}/${
        composition.parents.length
      }] Procesando Parent: ${parentUrl}`
    );

    const parentChildren = composition.children.filter(
      (childUrl) => childUrl.startsWith(parentUrl) && childUrl !== parentUrl
    );

    const urlsToFetch = [parentUrl, ...parentChildren];
    console.log(
      `  Encontrados ${parentChildren.length} children. Total a fetchear: ${urlsToFetch.length}`
    );

    const results: string[] = [];

    for (let i = 0; i < urlsToFetch.length; i += BATCH_SIZE) {
      const chunk = urlsToFetch.slice(i, i + BATCH_SIZE);
      console.log(
        `  Fetching chunk ${Math.ceil(i / BATCH_SIZE) + 1}/${Math.ceil(
          urlsToFetch.length / BATCH_SIZE
        )}...`
      );

      const chunkPromises = chunk.map((url) =>
        scrapeWithFetch(url, targets, removes)
      );
      const chunkResults = await Promise.all(chunkPromises);

      for (const res of chunkResults) {
        results.push(res.content);
      }
    }

    const finalContent = results.join("\n\n---\n\n");

    const filename = `${getLastUrlSegment(parentUrl)}.md`;
    const outputPath = path.join(outDir, filename);

    fs.writeFileSync(outputPath, finalContent, "utf-8");
    console.log(`  ✓ Generado: ${outputPath}`);
  }

  console.log("\nProceso completado.");
}
