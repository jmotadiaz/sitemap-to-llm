#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import minimist from 'minimist';
import { processSitemap } from './sitemap-utils.js';

// Cargar variables de entorno desde la raíz del proyecto
const scriptDir = __dirname || path.dirname(process.argv[1]);
const projectRoot = path.resolve(scriptDir, '..');
const BATCH_SIZE = 50;
dotenv.config({ path: path.join(projectRoot, '.env') });

interface CliArgs {
  input?: string;
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error('Uso: sitemap-to-jina -i <sitemap.(xml|json|url)> -o <directorio-salida>');
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

const { inputPath, outDir } = parseArgs();

// Verificar que existe la API key
const apiKey = process.env.JINA_API_KEY;
if (!apiKey) {
  console.error('Error: JINA_API_KEY no está definida en el archivo .env');
  process.exit(1);
}

interface ProcessResult {
  success: boolean;
  url: string;
  filename?: string;
  error?: string;
}

// Función para scrapear una URL usando Jina API (devuelve markdown directamente)
async function scrapeWithJina(url: string): Promise<string> {
  const requestUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'text/plain'
  };

  let response: Response;
  try {
    response = await fetch(requestUrl, { headers });
  } catch (err) {
    throw new Error(`Error de conexión: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

// Función para extraer el último segmento de la URL
function getLastUrlSegment(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(segment => segment.length > 0);
    if (segments.length > 0) {
      let lastSegment = segments[segments.length - 1];
      // Remover extensión si existe
      lastSegment = lastSegment.replace(/\.[^/.]+$/, '');
      return lastSegment || 'index';
    }
    return 'index';
  } catch {
    return 'untitled';
  }
}

let outDirFullPath: string;

// Función para procesar una URL individual
async function processUrl(url: string, index: number, total: number): Promise<ProcessResult> {
  try {
    console.log(`[${index + 1}/${total}] Procesando: ${url}`);

    const markdown = await scrapeWithJina(url);

    // Verificar que tenemos markdown
    if (!markdown || markdown.trim().length === 0) {
      throw new Error('No se obtuvo contenido markdown');
    }

    // Usar siempre el último segmento de la URL como nombre de archivo
    const filename = getLastUrlSegment(url) || `page-${index + 1}`;

    const outputFilePath = path.join(outDirFullPath, `${filename}.md`);
    fs.writeFileSync(outputFilePath, markdown, 'utf8');

    console.log(`  ✓ Guardado: ${filename}.md`);
    return { success: true, url, filename };
  } catch (err) {
    console.error(`  ✗ Error: ${(err as Error).message}`);
    return { success: false, url, error: (err as Error).message };
  }
}

// Función para dividir array en chunks
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Función principal
async function main(): Promise<void> {
  outDirFullPath = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);

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

  console.log(`Procesando ${urls.length} URLs con Jina Reader (${BATCH_SIZE} concurrentes por lote)...`);

  let successCount = 0;
  let errorCount = 0;

  // Dividir URLs en chunks configurables
  const urlChunks = chunkArray(urls, BATCH_SIZE);

  for (let chunkIndex = 0; chunkIndex < urlChunks.length; chunkIndex++) {
    const chunk = urlChunks[chunkIndex];
    const startIndex = chunkIndex * BATCH_SIZE;

    console.log(`\n📦 Procesando lote ${chunkIndex + 1}/${urlChunks.length} (${chunk.length} URLs)...`);

    // Procesar el chunk de URLs concurrentemente
    const results = await Promise.all(
      chunk.map((url, i) => processUrl(url, startIndex + i, urls.length))
    );

    // Contar éxitos y errores
    results.forEach(result => {
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    });
  }

  console.log(`\n✅ Completado: ${successCount} exitosos, ${errorCount} errores`);
}

main().catch((err: Error) => {
  console.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
