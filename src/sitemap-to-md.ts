#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';
import minimist from 'minimist';
import { processSitemap, fetchUrl } from './sitemap-utils.js';

interface CliArgs {
  input?: string;
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error('Uso: sitemap-to-md -i <sitemap.(xml|json|url)> -o <directorio-salida>');
  console.error('  -i --input   Sitemap XML, JSON con {urls: string[]}, o URL');
  console.error('  -o --output  Directorio donde guardar los .md generados');
  process.exit(exitCode);
}

function parseArgs(): { inputPath: string; outDir: string } {
  const argv = minimist<CliArgs>(process.argv.slice(2), {
    alias: { i: 'input', o: 'output', h: 'help' },
    string: ['input', 'output'],
    boolean: ['help']
  });

  if (argv.help || !argv.input || !argv.output) {
    printUsage(argv.help ? 0 : 1);
  }

  return { inputPath: argv.input!, outDir: argv.output! };
}

// Configurar Turndown
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Función para extraer el título del HTML
function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  return null;
}

// Función para convertir título a nombre de archivo
function titleToFilename(title: string | null): string {
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

// Función para delay
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Función para extraer el body o contenido principal del HTML
function extractBody(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

// Función principal
async function main(): Promise<void> {
  const { inputPath, outDir } = parseArgs();
  const outDirFullPath = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);

  console.log(`Procesando sitemap: ${inputPath}`);

  let result;
  try {
    result = await processSitemap(inputPath);
  } catch (err) {
    console.error(`Error al procesar el sitemap: ${(err as Error).message}`);
    process.exit(1);
  }

  const { urls } = result;

  if (urls.length === 0) {
    console.error('No se encontraron URLs en el sitemap');
    process.exit(1);
  }

  console.log(`Fuente detectada: ${result.source}`);
  console.log(`URLs encontradas: ${urls.length}`);

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
      console.error(`  ✗ Error: ${(err as Error).message}`);
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

