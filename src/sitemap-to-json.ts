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
    "Uso: sitemap-to-json -i <sitemap.(xml|url)> [-o <salida.json>]",
  );
  console.error("  -i --input   Sitemap XML o URL del sitemap");
  console.error("  -o --output  Ruta de salida JSON (opcional)");
  console.error("  -o --output  Ruta de salida JSON (opcional)");
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
      return `${filename}.json`;
    } catch {
      return "sitemap.json";
    }
  }

  // Para archivos locales
  return inputPath.toLowerCase().endsWith(".xml")
    ? inputPath.replace(/\.xml$/i, ".json")
    : `${inputPath}.json`;
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
    process.exit(1);
  }

  // Crear objeto JSON con la estructura solicitada
  const jsonOutput = { urls: filteredUrls };

  const outputPath = customOutputPath || generateOutputPath(inputPath);
  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  fs.writeFile(
    fullOutputPath,
    JSON.stringify(jsonOutput, null, 2),
    "utf8",
    (err) => {
      if (err) {
        console.error(`Error al escribir el archivo JSON: ${err.message}`);
        process.exit(1);
      }

      console.log(`Archivo JSON creado exitosamente: ${outputPath}`);
      console.log(
        `Se extrajeron ${filteredUrls.length} URLs (de ${urlsBeforeInclude} originales)`,
      );
    },
  );
}

main();
