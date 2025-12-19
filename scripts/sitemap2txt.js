#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

// Verificar que se haya proporcionado la ruta del sitemap
if (process.argv.length < 3) {
  console.error('Uso: sitemap-to-txt <ruta-al-sitemap.xml> [ruta-destino.txt]');
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath.replace(/\.xml$/, '.txt');

// Función para extraer URLs usando expresiones regulares
function extractUrlsFromSitemap(xmlContent) {
  const urls = [];
  // Expresión regular para encontrar todas las etiquetas <loc>...</loc>
  const urlRegex = /<loc>(.*?)<\/loc>/g;
  let match;

  while ((match = urlRegex.exec(xmlContent)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

// Función para leer archivo local o descargar desde URL
function getSitemapContent(pathOrUrl, callback) {
  // Verificar si es una URL
  try {
    const urlObj = new URL(pathOrUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    client.get(pathOrUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        callback(null, data);
      });
    }).on('error', (err) => {
      callback(err, null);
    });
  } catch (err) {
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
  const urls = extractUrlsFromSitemap(xmlContent);

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

