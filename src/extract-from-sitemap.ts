#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { processSitemap } from './sitemap-utils.js';

interface JsonInput {
  urls: string[];
  container?: string;
  excludeSelectors?: string[];
}

interface CliArgs {
  input?: string;
  pattern?: string;
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error('Uso: extract-from-sitemap -i <entrada.(xml|json|url)> [-p <patron>] [-o <salida.json>]');
  console.error('  -i --input     Sitemap XML, JSON con {urls: string[]}, o URL');
  console.error('  -p --pattern   Texto para filtrar URLs (opcional)');
  console.error('  -o --output    Nombre del archivo de salida (opcional)');
  process.exit(exitCode);
}

function parseArgs(): { inputPath: string; pattern?: string; outputPath?: string } {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: 'input', p: 'pattern', o: 'output', h: 'help' },
    string: ['input', 'pattern', 'output'],
    boolean: ['help']
  });

  if (argv.help || !argv.input) {
    printUsage(argv.help ? 0 : 1);
  }

  return {
    inputPath: argv.input!,
    pattern: argv.pattern,
    outputPath: argv.output
  };
}

function pathToFileName(pattern: string | undefined): string {
  if (!pattern) return 'filtered';
  const filename = pattern.toLowerCase().replaceAll('/', '-');
  return filename.endsWith('-') ? filename.slice(0, -1) : filename;
}

function generateOutputPath(inputPath: string, pattern?: string): string {
  const baseName = path.basename(inputPath).replace(/\.(xml|json)$/i, '');
  return `${baseName}-${pathToFileName(pattern)}.json`;
}

async function main(): Promise<void> {
  const { inputPath, pattern, outputPath: customOutputPath } = parseArgs();

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

  const filteredUrls = pattern
    ? result.urls.filter(url => url.includes(pattern))
    : result.urls;

  if (pattern) {
    console.log(`URLs filtradas (contienen "${pattern}"): ${filteredUrls.length}`);
  }

  const outputPath = customOutputPath || generateOutputPath(inputPath, pattern);
  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  // Leer container y excludeSelectors del archivo original si es JSON
  let container: string | undefined;
  let excludeSelectors: string[] | undefined;

  try {
    if (inputPath.toLowerCase().endsWith('.json')) {
      const originalContent = fs.readFileSync(
        path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath),
        'utf8'
      );
      const originalJson: JsonInput = JSON.parse(originalContent);
      container = originalJson.container;
      excludeSelectors = originalJson.excludeSelectors;
    }
  } catch {
    // Ignorar errores al leer propiedades adicionales
  }

  const output: JsonInput = { urls: filteredUrls };
  if (container) output.container = container;
  if (excludeSelectors) output.excludeSelectors = excludeSelectors;

  fs.writeFile(
    fullOutputPath,
    JSON.stringify(output, null, 2),
    'utf8',
    (err) => {
      if (err) {
        console.error(`Error al escribir el archivo JSON: ${err.message}`);
        process.exit(1);
      }

      console.log(`Archivo JSON creado exitosamente: ${outputPath}`);
    }
  );
}

main();

