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
  console.error('Uso: sitemap-to-txt -i <sitemap.(xml|json)> [-o <salida.txt>]');
  console.error('  Formatos soportados:');
  console.error('    - XML: sitemap estándar con etiquetas <loc>');
  console.error('    - JSON: { "urls": ["url1", "url2", ...] }');
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
    inputPath.match(/\.(xml|json)$/i)
      ? inputPath.replace(/\.(xml|json)$/i, '.txt')
      : `${inputPath}.txt`
  );

  return { inputPath, outputPath };
}

const { inputPath, outputPath } = parseArgs();

// Detectar si el contenido es JSON
function isJsonContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

// Función para extraer URLs de JSON con formato {urls: string[]}
function extractUrlsFromJson(jsonContent: string): string[] {
  try {
    const data = JSON.parse(jsonContent);
    if (data.urls && Array.isArray(data.urls)) {
      return data.urls.filter((url: unknown) => typeof url === 'string' && (url as string).length > 0);
    }
    // Si es directamente un array de URLs
    if (Array.isArray(data)) {
      return data.filter((url: unknown) => typeof url === 'string' && (url as string).length > 0);
    }
    console.error('Error: El JSON no tiene el formato esperado { "urls": [...] } o [...]');
    return [];
  } catch (err) {
    console.error(`Error al parsear JSON: ${(err as Error).message}`);
    return [];
  }
}

// Función para extraer URLs de XML usando expresiones regulares
function extractUrlsFromXml(xmlContent: string): string[] {
  const urls: string[] = [];
  const urlRegex = /<loc>(.*?)<\/loc>/g;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(xmlContent)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

// Función para extraer URLs detectando el formato automáticamente
function extractUrls(content: string): string[] {
  if (isJsonContent(content)) {
    console.log('Formato detectado: JSON');
    return extractUrlsFromJson(content);
  } else {
    console.log('Formato detectado: XML');
    return extractUrlsFromXml(content);
  }
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
getSitemapContent(inputPath, (err, content) => {
  if (err) {
    console.error(`Error al obtener el archivo: ${err.message}`);
    process.exit(1);
  }

  // Extraer URLs (detecta formato automáticamente)
  const urls = extractUrls(content!);

  // Verificar que se encontraron URLs
  if (urls.length === 0) {
    console.error('No se encontraron URLs en el archivo. Verifica el formato.');
    console.error('Formatos soportados:');
    console.error('  - XML: sitemap con etiquetas <loc>');
    console.error('  - JSON: { "urls": ["url1", "url2", ...] }');
    process.exit(1);
  }

  // Crear contenido TXT con cada URL en una línea
  const txtOutput = urls.join('\n');

  // Escribir archivo TXT
  fs.writeFile(path.join(process.cwd(), outputPath), txtOutput, 'utf8', (err) => {
    if (err) {
      console.error(`Error al escribir el archivo TXT: ${err.message}`);
      process.exit(1);
    }

    console.log(`Archivo TXT creado exitosamente: ${outputPath}`);
    console.log(`Se extrajeron ${urls.length} URLs`);
  });
});

