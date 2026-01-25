import fs from "fs";
import https from "https";
import http from "http";
import { URL } from "url";
import path from "path";

export interface SitemapResult {
  urls: string[];
  source: "url" | "xml" | "json";
}

/**
 * Extrae URLs de un contenido XML de sitemap
 */
export function extractUrlsFromXml(xmlContent: string): string[] {
  const urls: string[] = [];
  const urlRegex = /<loc>(.*?)<\/loc>/g;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(xmlContent)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

/**
 * Extrae URLs de un JSON con formato {urls: string[]} o string[]
 */
export function extractUrlsFromJson(jsonContent: string): string[] {
  try {
    const data = JSON.parse(jsonContent);

    // Formato {urls: string[]}
    if (data.urls && Array.isArray(data.urls)) {
      return data.urls.filter(
        (url: unknown) => typeof url === "string" && (url as string).length > 0,
      );
    }

    // Si es directamente un array de URLs
    if (Array.isArray(data)) {
      return data.filter(
        (url: unknown) => typeof url === "string" && (url as string).length > 0,
      );
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Detecta si el contenido es JSON
 */
export function isJsonContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

/**
 * Detecta si el contenido es XML
 */
export function isXmlContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("<?xml") || trimmed.startsWith("<");
}

/**
 * Descarga contenido desde una URL (con soporte para redirects)
 */
export function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === "https:" ? https : http;

      client
        .get(url, (res) => {
          // Manejar redirects
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            fetchUrl(res.headers.location).then(resolve).catch(reject);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve(data);
          });
        })
        .on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Lee un archivo local
 */
export function readLocalFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    fs.readFile(fullPath, "utf8", (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/**
 * Verifica si el input es una URL
 */
export function isUrl(input: string): boolean {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtiene el contenido desde una URL o archivo local
 */
export async function getContent(pathOrUrl: string): Promise<string> {
  if (isUrl(pathOrUrl)) {
    return fetchUrl(pathOrUrl);
  }
  return readLocalFile(pathOrUrl);
}

/**
 * Detecta el formato del input basándose en la extensión o contenido
 */
export function detectFormat(
  pathOrUrl: string,
  content: string,
): "xml" | "json" {
  // Primero intentar por extensión
  const lowerPath = pathOrUrl.toLowerCase();
  if (lowerPath.endsWith(".json")) return "json";
  if (lowerPath.endsWith(".xml")) return "xml";

  // Si no hay extensión clara, detectar por contenido
  if (isJsonContent(content)) return "json";
  return "xml";
}

/**
 * Procesa un sitemap desde múltiples fuentes:
 * - URL a descargar (XML o JSON)
 * - Archivo XML local
 * - Archivo JSON local con formato {urls: string[]}
 *
 * @param input - Ruta de archivo o URL del sitemap
 * @returns Objeto con las URLs extraídas y el tipo de fuente
 */
export async function processSitemap(input: string): Promise<SitemapResult> {
  const content = await getContent(input);
  const format = detectFormat(input, content);
  const source = isUrl(input) ? "url" : format;

  let urls: string[];
  if (format === "json") {
    urls = extractUrlsFromJson(content);
  } else {
    urls = extractUrlsFromXml(content);
  }

  return { urls, source };
}

/**
 * Versión con callback para compatibilidad con código existente
 */
export function getSitemapContent(
  pathOrUrl: string,
  callback: (err: NodeJS.ErrnoException | null, data: string | null) => void,
): void {
  getContent(pathOrUrl)
    .then((data) => callback(null, data))
    .catch((err) => callback(err, null));
}

/**
 * Filtra URLs basándose en patrones de inclusión y exclusión
 *
 * @param urls Lista de URLs a filtrar
 * @param includePatterns Patrones que deben estar presentes (si hay alguno)
 * @param excludePatterns Patrones que no deben estar presentes
 */
export function filterUrls(
  urls: string[],
  includePatterns: string | string[] = [],
  excludePatterns: string | string[] = [],
): {
  filteredUrls: string[];
  urlsBeforeInclude: number;
  urlsAfterInclude: number;
  urlsAfterExclude: number;
} {
  const urlsBeforeInclude = urls.length;

  // Normalizar a arrays
  const includes = Array.isArray(includePatterns)
    ? includePatterns
    : includePatterns
      ? [includePatterns]
      : [];
  const excludes = Array.isArray(excludePatterns)
    ? excludePatterns
    : excludePatterns
      ? [excludePatterns]
      : [];

  // Primero aplicar includePatterns (si hay alguno)
  // Si no hay includePatterns, se mantienen todas las URLs
  let urlsAfterIncludeStep = urls;
  if (includes.length > 0) {
    urlsAfterIncludeStep = urls.filter((url) =>
      includes.some((pattern) => url.includes(pattern)),
    );
  }
  const urlsAfterInclude = urlsAfterIncludeStep.length;

  if (includes.length > 0) {
    const patterns = includes.join(", ");
    console.log(
      `URLs incluidas (contienen alguno de [${patterns}]): ${urlsAfterInclude}`,
    );
  }

  // Luego aplicar excludePatterns sobre el subconjunto
  let finalUrls = urlsAfterIncludeStep;
  if (excludes.length > 0) {
    finalUrls = urlsAfterIncludeStep.filter(
      (url) => !excludes.some((pattern) => url.includes(pattern)),
    );
  }
  const urlsAfterExclude = finalUrls.length;

  if (excludes.length > 0) {
    const patterns = excludes.join(", ");
    console.log(
      `URLs excluidas (no contienen ninguno de [${patterns}]): ${urlsAfterInclude} -> ${urlsAfterExclude}`,
    );
  }

  return {
    filteredUrls: finalUrls,
    urlsBeforeInclude,
    urlsAfterInclude,
    urlsAfterExclude,
  };
}
