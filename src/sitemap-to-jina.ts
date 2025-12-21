#!/usr/bin/env node

import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import minimist from 'minimist';

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
  console.error('Uso: sitemap-to-jina -i <sitemap.(xml|json)> -o <directorio-salida>');
  console.error('  -i --input   Archivo local o URL con sitemap/JSON de URLs');
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

interface JinaExternalResource {
  as?: string | null;
  crossorigin?: string | null;
  type?: string | null;
  fetchpriority?: string | null;
  sizes?: string | null;
}

interface JinaExternalAssets {
  preload?: Record<string, JinaExternalResource | null | undefined> | null;
  icon?: Record<string, JinaExternalResource | null | undefined> | null;
}

interface JinaUsage {
  tokens?: number | null;
}

interface JinaMetadata {
  lang?: string | null;
  viewport?: string | null;
  'next-size-adjust'?: string | null;
  description?: string | null;
  [key: string]: string | null | undefined;
}

interface JinaDataPayload {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  content?: string | null;
  metadata?: JinaMetadata | null;
  external?: JinaExternalAssets | null;
  usage?: JinaUsage | null;
}

interface JinaMeta {
  usage?: JinaUsage | null;
}

interface JinaResponse {
  code?: number | null;
  status?: number | null;
  data?: JinaDataPayload | null;
  markdownResponse?: string | null;
  markdownLength?: number | null;
  meta?: JinaMeta | null;
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
function getSitemapContent(pathOrUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(pathOrUrl);
      const client = urlObj.protocol === 'https:' ? https : http;

      client.get(pathOrUrl, (res) => {
        // Manejar redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getSitemapContent(res.headers.location).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      }).on('error', reject);
    } catch {
      // No es una URL, tratar como ruta de archivo local
      const fullPath = path.isAbsolute(pathOrUrl) ? pathOrUrl : path.join(process.cwd(), pathOrUrl);
      fs.readFile(fullPath, 'utf8', (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    }
  });
}

// Función para extraer URLs desde JSON
function extractUrlsFromJson(jsonContent: string): string[] {
  try {
    const jsonData = JSON.parse(jsonContent);
    const { urls } = jsonData;

    if (!Array.isArray(urls) || urls.length === 0) {
      return [];
    }

    return urls;
  } catch {
    return [];
  }
}

// Función para scrapear una URL usando Jina API (devuelve JSON con metadata)
async function scrapeWithJinaJson(url: string): Promise<JinaResponse> {
  const requestUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const headers = {
    'X-Return-Format': 'json',
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json'
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

  try {
    const jsonData = await response.json() as JinaResponse;
    return jsonData;
  } catch (err) {
    throw new Error(`Error al parsear JSON: ${(err as Error).message}`);
  }
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

    // Hacer ambas peticiones en paralelo: JSON para el título y markdown para el contenido
    const response = await scrapeWithJinaJson(url);

    // Extraer título del JSON
    const title = response?.data?.title ?? null;
    const markdown = response?.markdownResponse ?? response?.data?.content ?? null;

    // Verificar que tenemos markdown
    if (!markdown || markdown.trim().length === 0) {
      throw new Error('No se obtuvo contenido markdown');
    }

    // Usar título para el nombre del archivo, o último segmento de URL como fallback
    const filename = title ? titleToFilename(title) : titleToFilename(getLastUrlSegment(url)) || `page-${index + 1}`;

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
  // Leer el archivo de entrada (sitemap XML o JSON)
  const inputFullPath = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
  outDirFullPath = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);

  let content: string;
  try {
    content = await getSitemapContent(inputFullPath);
  } catch (err) {
    console.error(`Error al leer el archivo: ${(err as Error).message}`);
    process.exit(1);
  }

  // Determinar si es JSON o XML basándose en la extensión o contenido
  const isJson = inputPath.toLowerCase().endsWith('.json') || content.trim().startsWith('{');
  let urls: string[];

  if (isJson) {
    urls = extractUrlsFromJson(content);
  } else {
    urls = extractUrlsFromSitemap(content);
  }

  if (urls.length === 0) {
    console.error('No se encontraron URLs en el archivo');
    process.exit(1);
  }

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

