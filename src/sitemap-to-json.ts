#!/usr/bin/env node

import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import path from 'path';

// Verificar que se haya proporcionado la ruta del sitemap
if (process.argv.length < 3) {
  console.error('Uso: node sitemap-parser.js <ruta-al-sitemap.xml> [ruta-destino.json]');
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath.replace(/\.xml$/, '.json');

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

