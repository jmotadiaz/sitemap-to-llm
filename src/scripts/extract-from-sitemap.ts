#!/usr/bin/env node

import fs from "fs";
import path from "path";
import minimist from "minimist";
import { extractSitemap } from "../extract-from-sitemap.js";

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

  try {
    const result = await extractSitemap({
      inputPath,
      includePatterns,
      excludePatterns,
      outputPath,
      format
    });

    console.log(`Fuente detectada: ${result.stats.source}`);
    console.log(`URLs encontradas: ${result.stats.found}`);

    if (includePatterns.length > 0) {
      console.log(
        `URLs incluidas (contienen alguno de [${includePatterns.join(", ")}]): ${
          result.stats.includedCount
        }`
      );
    }

    if (excludePatterns.length > 0) {
      console.log(
        `URLs excluidas (no contienen ninguno de [${excludePatterns.join(
          ", "
        )}]): ${result.stats.includedCount} -> ${result.stats.filtered}`
      );
    }

    const fullOutputPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.join(process.cwd(), outputPath);

    fs.writeFile(fullOutputPath, result.content, "utf8", (err) => {
      if (err) {
        console.error(`Error al escribir el archivo: ${err.message}`);
        process.exit(1);
      }

      console.log(
        `Archivo ${format.toUpperCase()} creado exitosamente: ${outputPath}`
      );
    });

  } catch (err) {
    console.error(`Error al procesar el sitemap: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
