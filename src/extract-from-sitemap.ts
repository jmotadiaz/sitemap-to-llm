#!/usr/bin/env node

import fs from "fs";
import path from "path";
import minimist from "minimist";
import { processSitemap } from "./sitemap-utils.js";

interface JsonInput {
  urls: string[];
  container?: string;
  excludeSelectors?: string[];
}

type OutputFormat = "json" | "txt";

interface CliArgs {
  input?: string;
  'include-pattern'?: string | string[];
  'exclude-pattern'?: string | string[];
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: extract-from-sitemap -i <entrada.(xml|json|url)> [--include-pattern <patron>...] [--exclude-pattern <patron>...] [-o <salida.txt|json>]"
  );
  console.error(
    "  -i --input            Sitemap XML, JSON con {urls: string[]}, o URL"
  );
  console.error(
    "  --include-pattern     Texto para filtrar URLs que incluyan el patrón (puede repetirse)"
  );
  console.error(
    "  --exclude-pattern     Texto para excluir URLs que coincidan con el patrón (puede repetirse)"
  );
  console.error(
    "  -o --output           Nombre del archivo de salida (default: sitemap.txt, extensión debe ser .txt o .json)"
  );
  process.exit(exitCode);
}

function getFormatFromExtension(outputPath: string): OutputFormat {
  const ext = path.extname(outputPath).toLowerCase();
  if (ext === ".txt") return "txt";
  if (ext === ".json") return "json";
  console.error(`Error: Extensión no soportada "${ext}". Usa .txt o .json`);
  process.exit(1);
}

function parseArgs(): {
  inputPath: string;
  includePatterns: string[];
  excludePatterns: string[];
  outputPath: string;
  format: OutputFormat;
} {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: "input", o: "output", h: "help" },
    string: ["input", "include-pattern", "exclude-pattern", "output"],
    boolean: ["help"],
  });

  if (argv.help || !argv.input) {
    printUsage(argv.help ? 0 : 1);
  }

  // Normalizar includePatterns a array
  let includePatterns: string[] = [];
  const includeArg = argv['include-pattern'];
  if (includeArg) {
    includePatterns = Array.isArray(includeArg)
      ? includeArg
      : [includeArg];
  }

  // Normalizar excludePatterns a array
  let excludePatterns: string[] = [];
  const excludeArg = argv['exclude-pattern'];
  if (excludeArg) {
    excludePatterns = Array.isArray(excludeArg)
      ? excludeArg
      : [excludeArg];
  }

  const outputPath = argv.output || "sitemap.txt";
  const format = getFormatFromExtension(outputPath);

  return {
    inputPath: argv.input!,
    includePatterns,
    excludePatterns,
    outputPath,
    format,
  };
}

async function main(): Promise<void> {
  const { inputPath, includePatterns, excludePatterns, outputPath, format } =
    parseArgs();

  console.log(`Procesando: ${inputPath}`);

  let result;
  try {
    result = await processSitemap(inputPath);
  } catch (err) {
    console.error(`Error al procesar el sitemap: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`Fuente detectada: ${result.source}`);
  console.log(`URLs encontradas: ${result.urls.length}`);

  // Primero aplicar includePatterns (si hay alguno)
  let filteredUrls =
    includePatterns.length > 0
      ? result.urls.filter((url) =>
          includePatterns.some((pattern) => url.includes(pattern))
        )
      : result.urls;

  if (includePatterns.length > 0) {
    console.log(
      `URLs incluidas (contienen alguno de [${includePatterns.join(", ")}]): ${
        filteredUrls.length
      }`
    );
  }

  // Luego aplicar excludePatterns sobre el subconjunto
  if (excludePatterns.length > 0) {
    const countBefore = filteredUrls.length;
    filteredUrls = filteredUrls.filter(
      (url) => !excludePatterns.some((pattern) => url.includes(pattern))
    );
    console.log(
      `URLs excluidas (no contienen ninguno de [${excludePatterns.join(
        ", "
      )}]): ${countBefore} -> ${filteredUrls.length}`
    );
  }

  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  // Leer container y excludeSelectors del archivo original si es JSON
  let container: string | undefined;
  let excludeSelectors: string[] | undefined;

  try {
    if (inputPath.toLowerCase().endsWith(".json")) {
      const originalContent = fs.readFileSync(
        path.isAbsolute(inputPath)
          ? inputPath
          : path.join(process.cwd(), inputPath),
        "utf8"
      );
      const originalJson: JsonInput = JSON.parse(originalContent);
      container = originalJson.container;
      excludeSelectors = originalJson.excludeSelectors;
    }
  } catch {
    // Ignorar errores al leer propiedades adicionales
  }

  let outputContent: string;
  if (format === "json") {
    const output: JsonInput = { urls: filteredUrls };
    if (container) output.container = container;
    if (excludeSelectors) output.excludeSelectors = excludeSelectors;
    outputContent = JSON.stringify(output, null, 2);
  } else {
    // formato txt: una URL por línea
    outputContent = filteredUrls.join("\n");
  }

  fs.writeFile(fullOutputPath, outputContent, "utf8", (err) => {
    if (err) {
      console.error(`Error al escribir el archivo: ${err.message}`);
      process.exit(1);
    }

    console.log(
      `Archivo ${format.toUpperCase()} creado exitosamente: ${outputPath}`
    );
  });
}

main();
