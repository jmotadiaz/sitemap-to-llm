#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');
const TurndownService = require('turndown');

// Verificar argumentos
if (process.argv.length < 4) {
  console.error('Uso: web-to-md <ruta-al-json> <outDir>');
  console.error('El JSON debe tener la estructura: { urls: string[] }');
  process.exit(1);
}

const inputPath = process.argv[2];
const outDir = process.argv[3];

// Configurar Turndown
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Función para extraer el título del HTML
function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  return null;
}

// Función para convertir título a nombre de archivo
function titleToFilename(title) {
  if (!title) return 'untitled';
  
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9\s-]/g, '') // Solo letras, números, espacios y guiones
    .trim()
    .replace(/\s+/g, '-') // Espacios a guiones
    .replace(/-+/g, '-'); // Múltiples guiones a uno solo
}

// Función para descargar una URL
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      client.get(url, (res) => {
        // Manejar redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      }).on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Función para delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Función para extraer el body o contenido principal del HTML
function extractBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

// Función principal
async function main() {
  // Leer el JSON de entrada
  const inputFullPath = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
  const outDirFullPath = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);

  let jsonData;
  try {
    jsonData = JSON.parse(fs.readFileSync(inputFullPath, 'utf8'));
  } catch (err) {
    console.error(`Error al leer el archivo JSON: ${err.message}`);
    process.exit(1);
  }

  const { urls } = jsonData;

  if (!Array.isArray(urls) || urls.length === 0) {
    console.error('El JSON debe contener un array "urls" con al menos una URL');
    process.exit(1);
  }

  // Crear directorio de salida si no existe
  if (!fs.existsSync(outDirFullPath)) {
    fs.mkdirSync(outDirFullPath, { recursive: true });
  }

  console.log(`Procesando ${urls.length} URLs...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] Descargando: ${url}`);

    try {
      const html = await fetchUrl(url);
      const title = extractTitle(html);
      const filename = titleToFilename(title) || `page-${i + 1}`;
      const body = extractBody(html);
      const markdown = turndownService.turndown(body);

      const outputFilePath = path.join(outDirFullPath, `${filename}.md`);
      fs.writeFileSync(outputFilePath, markdown, 'utf8');

      console.log(`  ✓ Guardado: ${filename}.md`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      errorCount++;
    }

    // Delay de 50ms entre URLs (excepto la última)
    if (i < urls.length - 1) {
      await delay(50);
    }
  }

  console.log(`\nCompletado: ${successCount} exitosos, ${errorCount} errores`);
}

main();


