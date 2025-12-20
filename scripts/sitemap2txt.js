#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

// Verificar que se haya proporcionado la ruta del sitemap
if (process.argv.length < 3) {
  console.error('Uso: sitemap-to-txt <ruta-al-sitemap.xml|.json> [ruta-destino.txt]');
  console.error('  Formatos soportados:');
  console.error('    - XML: sitemap estándar con etiquetas <loc>');
  console.error('    - JSON: { "urls": ["url1", "url2", ...] }');
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath.replace(/\.(xml|json)$/i, '.txt');

// Detectar si el contenido es JSON
function isJsonContent(content) {
  const trimmed = content.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

// Función para extraer URLs de JSON con formato {urls: string[]}
function extractUrlsFromJson(jsonContent) {
  try {
    const data = JSON.parse(jsonContent);
    if (data.urls && Array.isArray(data.urls)) {
      return data.urls.filter(url => typeof url === 'string' && url.length > 0);
    }
    // Si es directamente un array de URLs
    if (Array.isArray(data)) {
      return data.filter(url => typeof url === 'string' && url.length > 0);
    }
    console.error('Error: El JSON no tiene el formato esperado { "urls": [...] } o [...]');
    return [];
  } catch (err) {
    console.error(`Error al parsear JSON: ${err.message}`);
    return [];
  }
}

// Función para extraer URLs de XML usando expresiones regulares
function extractUrlsFromXml(xmlContent) {
  const urls = [];
  // Expresión regular para encontrar todas las etiquetas <loc>...</loc>
  const urlRegex = /<loc>(.*?)<\/loc>/g;
  let match;

  while ((match = urlRegex.exec(xmlContent)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

// Función para extraer URLs detectando el formato automáticamente
function extractUrls(content) {
  if (isJsonContent(content)) {
    console.log('Formato detectado: JSON');
    return extractUrlsFromJson(content);
  } else {
    console.log('Formato detectado: XML');
    return extractUrlsFromXml(content);
  }
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
getSitemapContent(inputPath, (err, content) => {
  if (err) {
    console.error(`Error al obtener el archivo: ${err.message}`);
    process.exit(1);
  }

  // Extraer URLs (detecta formato automáticamente)
  const urls = extractUrls(content);

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

