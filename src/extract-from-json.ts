#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

interface JsonInput {
  urls: string[];
  container?: string;
  excludeSelectors?: string[];
}

// Verificar que se haya proporcionado la ruta del sitemap
if (process.argv.length < 3) {
  console.error('Uso: node sitemap-parser.js <ruta-al-sitemap.xml> [ruta-destino.json]');
  process.exit(1);
}

const inputPath = process.argv[2];
const pattern = process.argv[3];
const outputParam = process.argv[4];

const { urls, container, excludeSelectors }: JsonInput = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), inputPath), 'utf8')
);
const filteredUrls = pattern ? urls.filter(url => url.includes(pattern)) : urls;

const outputPath = outputParam || inputPath.replace(/\.json$/, `-${pathToFileName(pattern)}.json`);

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

