#!/usr/bin/env node

import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import path from 'path';
import minimist from 'minimist';

interface CliArgs {
  input?: string;
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error('Uso: sitemap-to-json -i <sitemap.xml> [-o <salida.json>]');
  console.error('Alias: -i --input   Ruta del sitemap (archivo local o URL)');
  console.error('       -o --output  Ruta de salida JSON (opcional)');
  process.exit(exitCode);
}

function parseArgs(): { inputPath: string; outputPath: string } {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: 'input', o: 'output', h: 'help' },
    string: ['input', 'output'],
    boolean: ['help']
  });

  if (argv.help || !argv.input) {
    printUsage(argv.help ? 0 : 1);
  }

  const inputPath = argv.input!;
  const outputPath = argv.output || (
    inputPath.toLowerCase().endsWith('.xml')
      ? inputPath.replace(/\.xml$/i, '.json')
      : `${inputPath}.json`
  );

  return { inputPath, outputPath };
}

const { inputPath, outputPath } = parseArgs();

// Función para extraer URLs usando expresiones regulares
function extractUrlsFromSitemap(xmlContent: string): string[] {
  const urls: string[] = [];
  const urlRegex = /<loc>(.*?)<\/loc>/g;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(xmlContent)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

// Función para leer archivo local o descargar desde URL
function getSitemapContent(pathOrUrl: string, callback: (err: NodeJS.ErrnoException | null, data: string | null) => void): void {
  // Verificar si es una URL
  try {
    const urlObj = new URL(pathOrUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    client.get(pathOrUrl, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk;
      });
      res.on('end', () => {
        callback(null, data);
      });
    }).on('error', (err) => {
      callback(err, null);
    });
  } catch {
    // No es una URL, tratar como ruta de archivo local
    fs.readFile(path.join(process.cwd(), pathOrUrl), 'utf8', callback);
  }
}

// Obtener el contenido del sitemap
getSitemapContent(inputPath, (err, xmlContent) => {
  if (err) {
    console.error(`Error al obtener el sitemap: ${err.message}`);
    process.exit(1);
  }

  // Extraer URLs
  const urls = extractUrlsFromSitemap(xmlContent!);

  // Crear objeto JSON con la estructura solicitada
  const jsonOutput = { urls };

  // Escribir archivo JSON
  fs.writeFile(path.join(process.cwd(), outputPath), JSON.stringify(jsonOutput, null, 2), 'utf8', (err) => {
    if (err) {
      console.error(`Error al escribir el archivo JSON: ${err.message}`);
      process.exit(1);
    }

    console.log(`Archivo JSON creado exitosamente: ${outputPath}`);
    console.log(`Se extrajeron ${urls.length} URLs`);
  });
});

