#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import minimist from 'minimist';

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
  console.error('Uso: extract-from-json -i <entrada.json> [-p <patron>] [-o <salida.json>]');
  console.error('  -i --input     JSON con { urls, container?, excludeSelectors? }');
  console.error('  -p --pattern   Texto para filtrar URLs (opcional)');
  console.error('  -o --output    Nombre del archivo de salida (opcional)');
  process.exit(exitCode);
}

function parseArgs(): { inputPath: string; pattern?: string; outputPath: string } {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: 'input', p: 'pattern', o: 'output', h: 'help' },
    string: ['input', 'pattern', 'output'],
    boolean: ['help']
  });

  if (argv.help || !argv.input) {
    printUsage(argv.help ? 0 : 1);
  }

  const inputPath = argv.input!;
  const pattern = argv.pattern;
  const outputPath = argv.output || inputPath.replace(/\.json$/i, `-${pathToFileName(pattern)}.json`);

  return { inputPath, pattern, outputPath };
}

const { inputPath, pattern, outputPath } = parseArgs();

const { urls, container, excludeSelectors }: JsonInput = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), inputPath), 'utf8')
);
const filteredUrls = pattern ? urls.filter(url => url.includes(pattern)) : urls;

fs.writeFile(
  path.join(process.cwd(), outputPath),
  JSON.stringify({ container, excludeSelectors, urls: filteredUrls }, null, 2),
  'utf8',
  (err) => {
    if (err) {
      console.error(`Error al escribir el archivo JSON: ${err.message}`);
      process.exit(1);
    }

    console.log(`Archivo JSON creado exitosamente: ${outputPath}`);
  }
);

function pathToFileName(pattern: string | undefined): string {
  if (!pattern) return 'filtered';
  const filename = pattern.toLowerCase().replaceAll('/', '-');
  return filename.endsWith('-') ? filename.slice(0, -1) : filename;
}

