#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { processSitemap, isUrl } from './sitemap-utils.js';

interface CliArgs {
  input?: string;
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error('Uso: sitemap-to-json -i <sitemap.(xml|url)> [-o <salida.json>]');
  console.error('  -i --input   Sitemap XML o URL del sitemap');
  console.error('  -o --output  Ruta de salida JSON (opcional)');
  process.exit(exitCode);
}

function parseArgs(): { inputPath: string; outputPath?: string } {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: 'input', o: 'output', h: 'help' },
    string: ['input', 'output'],
    boolean: ['help']
  });

  if (argv.help || !argv.input) {
    printUsage(argv.help ? 0 : 1);
  }

  return { inputPath: argv.input!, outputPath: argv.output };
}

function generateOutputPath(inputPath: string): string {
  if (isUrl(inputPath)) {
    // Para URLs, usar el nombre del archivo o 'sitemap'
    try {
      const url = new URL(inputPath);
      const pathname = url.pathname;
      const filename = path.basename(pathname, path.extname(pathname)) || 'sitemap';
      return `${filename}.json`;
    } catch {
      return 'sitemap.json';
    }
  }

  // Para archivos locales
  return inputPath.toLowerCase().endsWith('.xml')
    ? inputPath.replace(/\.xml$/i, '.json')
    : `${inputPath}.json`;
}

async function main(): Promise<void> {
  const { inputPath, outputPath: customOutputPath } = parseArgs();

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

  if (urls.length === 0) {
    console.error('No se encontraron URLs en el sitemap');
    process.exit(1);
  }

  // Crear objeto JSON con la estructura solicitada
  const jsonOutput = { urls };

  const outputPath = customOutputPath || generateOutputPath(inputPath);
  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  fs.writeFile(fullOutputPath, JSON.stringify(jsonOutput, null, 2), 'utf8', (err) => {
    if (err) {
      console.error(`Error al escribir el archivo JSON: ${err.message}`);
      process.exit(1);
    }

    console.log(`Archivo JSON creado exitosamente: ${outputPath}`);
    console.log(`Se extrajeron ${urls.length} URLs`);
  });
}

main();
