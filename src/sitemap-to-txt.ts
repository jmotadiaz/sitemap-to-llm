#!/usr/bin/env node

import fs from "fs";
import path from "path";
import minimist from "minimist";
import { processSitemap, isUrl, filterUrls } from "./sitemap-utils.js";

interface CliArgs {
  input?: string;
  output?: string;
  "include-pattern"?: string | string[];
  "exclude-pattern"?: string | string[];
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: sitemap-to-txt -i <sitemap.(xml|json|url)> [-o <salida.txt>]",
  );
  console.error("  Formatos soportados:");
  console.error("    - XML: sitemap estándar con etiquetas <loc>");
  console.error('    - JSON: { "urls": ["url1", "url2", ...] }');
  console.error("    - URL: descarga el sitemap desde una URL");
  console.error(
    "  --include-pattern     Texto para filtrar URLs que incluyan el patrón (puede repetirse)",
  );
  console.error(
    "  --exclude-pattern     Texto para excluir URLs que coincidan con el patrón (puede repetirse)",
  );
  process.exit(exitCode);
}

function parseArgs(): {
  inputPath: string;
  outputPath?: string;
  includePatterns: string | string[];
  excludePatterns: string | string[];
} {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: "input", o: "output", h: "help" },
    string: ["input", "output", "include-pattern", "exclude-pattern"],
    boolean: ["help"],
  });

  if (argv.help || !argv.input) {
    printUsage(argv.help ? 0 : 1);
  }

  return {
    inputPath: argv.input!,
    outputPath: argv.output,
    includePatterns: argv["include-pattern"] || [],
    excludePatterns: argv["exclude-pattern"] || [],
  };
}

function generateOutputPath(inputPath: string): string {
  if (isUrl(inputPath)) {
    // Para URLs, usar el nombre del archivo o 'sitemap'
    try {
      const url = new URL(inputPath);
      const pathname = url.pathname;
      const filename =
        path.basename(pathname, path.extname(pathname)) || "sitemap";
      return `${filename}.txt`;
    } catch {
      return "sitemap.txt";
    }
  }

  // Para archivos locales
  return inputPath.match(/\.(xml|json)$/i)
    ? inputPath.replace(/\.(xml|json)$/i, ".txt")
    : `${inputPath}.txt`;
}

async function main(): Promise<void> {
  const {
    inputPath,
    outputPath: customOutputPath,
    includePatterns,
    excludePatterns,
  } = parseArgs();

  console.log(`Procesando: ${inputPath}`);

  let result;
  try {
    result = await processSitemap(inputPath);
  } catch (err) {
    console.error(`Error al procesar el sitemap: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`Fuente detectada: ${result.source}`);

  const { urls } = result;

  // Filtrar URLs
  const {
    filteredUrls,
    urlsBeforeInclude,
    urlsAfterInclude,
    urlsAfterExclude,
  } = filterUrls(urls, includePatterns, excludePatterns);

  if (filteredUrls.length === 0) {
    console.error(
      "No se encontraron URLs en el sitemap (o todas fueron filtradas)",
    );
    console.error("Formatos soportados:");
    console.error("  - XML: sitemap con etiquetas <loc>");
    console.error('  - JSON: { "urls": ["url1", "url2", ...] }');
    process.exit(1);
  }

  // Crear contenido TXT con cada URL en una línea
  const txtOutput = filteredUrls.join("\n");

  const outputPath = customOutputPath || generateOutputPath(inputPath);
  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  fs.writeFile(fullOutputPath, txtOutput, "utf8", (err) => {
    if (err) {
      console.error(`Error al escribir el archivo TXT: ${err.message}`);
      process.exit(1);
    }

    console.log(`Archivo TXT creado exitosamente: ${outputPath}`);
    console.log(
      `Se extrajeron ${filteredUrls.length} URLs (de ${urlsBeforeInclude} originales)`,
    );
  });
}

main();
