#!/usr/bin/env node

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import minimist from "minimist";
import TurndownService from "turndown";
import { load } from "cheerio";

// Cargar variables de entorno
const scriptDir = __dirname || path.dirname(process.argv[1]);
dotenv.config({ path: path.join(scriptDir, "../.env") });

const BATCH_SIZE = 10; // Reducimos un poco la concurrencia para local processing

interface Composition {
  targetSelectors?: string[];
  targerSelectors?: string[]; // typo support
  removeSelectors?: string[];
  parents: string[];
  children: string[];
}

interface CliArgs {
  input?: string;
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: composition-to-markdown -i <composition.json> -o <directorio-salida>"
  );
  console.error("\nOpciones:");
  console.error(
    "  -i --input            Archivo JSON de composición (default: composition.json)"
  );
  console.error(
    "  -o --output           Directorio donde guardar los .md generados"
  );
  process.exit(exitCode);
}

function parseArgs(): { inputPath: string; outDir: string } {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: "input", o: "output", h: "help" },
    string: ["input", "output"],
    boolean: ["help"],
  });

  if (argv.help) {
    printUsage(0);
  }

  return {
    inputPath: argv.input || "composition.json",
    outDir: argv.output || "output",
  };
}

const { inputPath, outDir } = parseArgs();

// Configurar Turndown
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: "---",
});

turndownService.remove("script");

// Función para scrapear localmente
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

    // Obtener título
    const title = $("title").text().trim() || "untitled";

    // Eliminar elementos no deseados
    if (removeSelectors.length > 0) {
      removeSelectors.forEach((selector) => {
        $(selector).remove();
      });
    }

    let htmlToConvert = "";

    // Seleccionar contenido objetivo
    if (targetSelectors.length > 0) {
      // Creamos un contenedor virtual para juntar lo que encontremos
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
        // Si no encuentra nada con los selectores, fallback al body o html completo?
        // Generalmente si especificas target y no está, es mejor devolver vacío o aviso.
        // Pero para robustez, si está vacío intentaremos devolver ""
        htmlToConvert = "";
        console.warn(
          `    ⚠️ Warning: No content found for target selectors in ${url}`
        );
      }
    } else {
      // Sin target selectors, tomamos el body
      htmlToConvert = $("body").html() || "";
    }

    // Convertir a MD
    let markdown = turndownService.turndown(htmlToConvert);

    // Asegurar título al principio si no está ya (opcional, pero Jina lo hacía)
    // Vamos a replicar el formato: Titulo h1 arriba
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

async function processComposition() {
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

  // Resolver selectores
  const targets =
    composition.targetSelectors || composition.targerSelectors || [];
  const removes = composition.removeSelectors || [];

  console.log(`Cargado composition.json`);
  console.log(`Parents: ${composition.parents.length}`);
  console.log(`Children totales: ${composition.children.length}`);
  console.log(`Target Selectors: ${targets.join(", ")}`);
  console.log(`Remove Selectors: ${removes.join(", ")}`);

  // Crear directorio de salida
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Procesar cada parent
  for (const [index, parentUrl] of composition.parents.entries()) {
    console.log(
      `\n[${index + 1}/${
        composition.parents.length
      }] Procesando Parent: ${parentUrl}`
    );

    // Identificar children de este parent
    const parentChildren = composition.children.filter(
      (childUrl) => childUrl.startsWith(parentUrl) && childUrl !== parentUrl
    );

    const urlsToFetch = [parentUrl, ...parentChildren];
    console.log(
      `  Encontrados ${parentChildren.length} children. Total a fetchear: ${urlsToFetch.length}`
    );

    const results: string[] = [];

    // Chunking logic
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

    // Unir todo el contenido
    const finalContent = results.join("\n\n---\n\n");

    const filename = `${getLastUrlSegment(parentUrl)}.md`;
    const outputPath = path.join(outDir, filename);

    fs.writeFileSync(outputPath, finalContent, "utf-8");
    console.log(`  ✓ Generado: ${outputPath}`);
  }

  console.log("\nProceso completado.");
}

processComposition().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
