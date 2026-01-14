#!/usr/bin/env node

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import minimist from "minimist";
import { processSitemap } from "./sitemap-utils.js";

// Cargar variables de entorno desde el directorio del script
const scriptDir = __dirname || path.dirname(process.argv[1]);
const BATCH_SIZE = 50;
dotenv.config({ path: path.join(scriptDir, ".env") });

interface CliArgs {
  input?: string;
  output?: string;
  "title-type"?: string;
  "target-selector"?: string;
  "remove-selector"?: string;
  "numeric-prefix"?: boolean;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: sitemap-to-jina -i <sitemap.(xml|json|url)> -o <directorio-salida> [opciones]"
  );
  console.error("\nOpciones:");
  console.error(
    "  -i --input            Sitemap XML, JSON con {urls: string[]}, o URL"
  );
  console.error(
    "  -o --output           Directorio donde guardar los .md generados"
  );
  console.error(
    "  -t --title-type       Tipo de título: 'page' (título de la página) o 'url' (segmento URL) [default: page]"
  );
  console.error(
    "  --target-selector     Selectores CSS a incluir (ej: 'main, #content')"
  );
  console.error(
    "  --remove-selector     Selectores CSS a excluir (ej: 'header, .ads, #footer')"
  );
  console.error(
    "  --numeric-prefix      Usar prefijo numérico en lugar de sufijo (ej: 001-titulo, 010-titulo)"
  );
  process.exit(exitCode);
}

function parseArgs(): {
  inputPath: string;
  outDir: string;
  titleType: "page" | "url";
  targetSelector?: string;
  removeSelector?: string;
  numericPrefix: boolean;
} {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: "input", o: "output", t: "title-type", h: "help" },
    string: [
      "input",
      "output",
      "title-type",
      "target-selector",
      "remove-selector",
    ],
    boolean: ["help", "numeric-prefix"],
  });

  if (argv.help || !argv.input || !argv.output) {
    printUsage(argv.help ? 0 : 1);
  }

  const titleType = argv["title-type"] || "page";
  if (titleType !== "page" && titleType !== "url") {
    console.error(
      `Error: title-type debe ser 'page' o 'url', recibido: '${titleType}'`
    );
    process.exit(1);
  }

  return {
    inputPath: argv.input!,
    outDir: argv.output!,
    titleType,
    targetSelector: argv["target-selector"],
    removeSelector: argv["remove-selector"],
    numericPrefix: argv["numeric-prefix"] || false,
  };
}

const {
  inputPath,
  outDir,
  titleType,
  targetSelector,
  removeSelector,
  numericPrefix,
} = parseArgs();

// Verificar que existe la API key
const apiKey = process.env.JINA_API_KEY;
if (!apiKey) {
  console.error("Error: JINA_API_KEY no está definida en el archivo .env");
  process.exit(1);
}

interface ProcessResult {
  success: boolean;
  url: string;
  filename?: string;
  error?: string;
}

// Función para scrapear una URL usando Jina API (formato por defecto con encabezado)
async function scrapeWithJina(
  url: string
): Promise<{ content: string; title: string }> {
  const requestUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "X-Md-Link-Style": "discarded",
    "X-Md-Heading-Style": "atx",
  };

  // Añadir selectores solo si están especificados
  if (targetSelector) {
    headers["X-Target-Selector"] = targetSelector;
  }

  if (removeSelector) {
    headers["X-Remove-Selector"] = removeSelector;
  }

  let response: Response;
  try {
    response = await fetch(requestUrl, { headers });
  } catch (err) {
    throw new Error(`Error de conexión: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const textResponse = await response.text();

  // Extraer el título del encabezado
  // Formato esperado:
  // Title: Block Diagram Syntax | Mermaid
  // URL Source: ...
  // Published Time: ...
  // Markdown Content:
  const titleMatch = textResponse.match(/^Title:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "untitled";

  // Eliminar el encabezado completo hasta "Markdown Content:"
  const markdownContentMatch = textResponse.match(
    /Markdown Content:\s*\n([\s\S]*)/i
  );
  const content = markdownContentMatch
    ? `# ${title}\n\n${markdownContentMatch[1].trim()}`
    : textResponse;

  return {
    content,
    title,
  };
}

// Función para extraer el último segmento de la URL
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

// Función para sanitizar el título de página para nombre de archivo
function sanitizePageTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") // Reemplazar caracteres no alfanuméricos con guiones
      .replace(/^-+|-+$/g, "") // Eliminar guiones al inicio y final
      .slice(0, 100) || "untitled"
  ); // Limitar longitud y usar fallback
}

let outDirFullPath: string;

// Función para procesar una URL individual
async function processUrl(
  url: string,
  index: number,
  total: number
): Promise<ProcessResult> {
  try {
    console.log(`[${index + 1}/${total}] Procesando: ${url}`);

    const { content: markdown, title: pageTitle } = await scrapeWithJina(url);

    // Verificar que tenemos markdown
    if (!markdown || markdown.trim().length === 0) {
      throw new Error("No se obtuvo contenido markdown");
    }

    // Elegir el nombre de archivo según el tipo de título configurado
    let baseFilename: string;
    if (titleType === "page") {
      baseFilename = sanitizePageTitle(pageTitle);
      console.log(`  📄 Título: ${pageTitle}`);
    } else {
      baseFilename = getLastUrlSegment(url);
    }

    // Generar nombre de archivo con prefijo o sufijo numérico
    let filename: string;
    if (numericPrefix) {
      // Calcular el ancho del padding basado en el total de URLs
      const paddingWidth = total.toString().length;
      const paddedIndex = (index + 1).toString().padStart(paddingWidth, "0");
      filename = `${paddedIndex}-${baseFilename}`;
    } else {
      filename = pageTitle;
    }

    const outputFilePath = path.join(outDirFullPath, `${filename}.md`);
    fs.writeFileSync(outputFilePath, markdown, "utf8");

    console.log(`  ✓ Guardado: ${filename}.md`);
    return { success: true, url, filename };
  } catch (err) {
    console.error(`  ✗ Error: ${(err as Error).message}`);
    return { success: false, url, error: (err as Error).message };
  }
}

// Función para dividir array en chunks
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Función principal
async function main(): Promise<void> {
  outDirFullPath = path.isAbsolute(outDir)
    ? outDir
    : path.join(process.cwd(), outDir);

  console.log(`Procesando sitemap: ${inputPath}`);

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
  console.log(`URLs encontradas: ${urls.length}`);

  // Crear directorio de salida si no existe
  if (!fs.existsSync(outDirFullPath)) {
    fs.mkdirSync(outDirFullPath, { recursive: true });
  }

  console.log(
    `Procesando ${urls.length} URLs con Jina Reader (${BATCH_SIZE} concurrentes por lote)...`
  );

  let successCount = 0;
  let errorCount = 0;

  // Dividir URLs en chunks configurables
  const urlChunks = chunkArray(urls, BATCH_SIZE);

  for (let chunkIndex = 0; chunkIndex < urlChunks.length; chunkIndex++) {
    const chunk = urlChunks[chunkIndex];
    const startIndex = chunkIndex * BATCH_SIZE;

    console.log(
      `\n📦 Procesando lote ${chunkIndex + 1}/${urlChunks.length} (${
        chunk.length
      } URLs)...`
    );

    // Procesar el chunk de URLs concurrentemente
    const results = await Promise.all(
      chunk.map((url, i) => processUrl(url, startIndex + i, urls.length))
    );

    // Contar éxitos y errores
    results.forEach((result) => {
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    });
  }

  console.log(
    `\n✅ Completado: ${successCount} exitosos, ${errorCount} errores`
  );
}

main().catch((err: Error) => {
  console.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
