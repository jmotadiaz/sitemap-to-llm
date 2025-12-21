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
  console.error('Uso: sitemap-to-txt -i <sitemap.(xml|json|url)> [-o <salida.txt>]');
  console.error('  Formatos soportados:');
  console.error('    - XML: sitemap estándar con etiquetas <loc>');
  console.error('    - JSON: { "urls": ["url1", "url2", ...] }');
  console.error('    - URL: descarga el sitemap desde una URL');
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
      return `${filename}.txt`;
    } catch {
      return 'sitemap.txt';
    }
  }

  // Para archivos locales
  return inputPath.match(/\.(xml|json)$/i)
    ? inputPath.replace(/\.(xml|json)$/i, '.txt')
    : `${inputPath}.txt`;
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
    console.error('Formatos soportados:');
    console.error('  - XML: sitemap con etiquetas <loc>');
    console.error('  - JSON: { "urls": ["url1", "url2", ...] }');
    process.exit(1);
  }

  // Crear contenido TXT con cada URL en una línea
  const txtOutput = urls.join('\n');

  const outputPath = customOutputPath || generateOutputPath(inputPath);
  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  fs.writeFile(fullOutputPath, txtOutput, 'utf8', (err) => {
    if (err) {
      console.error(`Error al escribir el archivo TXT: ${err.message}`);
      process.exit(1);
    }

    console.log(`Archivo TXT creado exitosamente: ${outputPath}`);
    console.log(`Se extrajeron ${urls.length} URLs`);
  });
}

main();
