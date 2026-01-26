import fs from "fs";
import path from "path";
import { processSitemap, isUrl, filterUrls } from "./sitemap-utils.js";

export interface SitemapToJsonOptions {
  inputPath: string;
  outputPath?: string;
  includePatterns?: string | string[];
  excludePatterns?: string | string[];
}

function generateOutputPath(inputPath: string): string {
  if (isUrl(inputPath)) {
    // Para URLs, usar el nombre del archivo o 'sitemap'
    try {
      const url = new URL(inputPath);
      const pathname = url.pathname;
      const filename =
        path.basename(pathname, path.extname(pathname)) || "sitemap";
      return `${filename}.json`;
    } catch {
      return "sitemap.json";
    }
  }

  // Para archivos locales
  return inputPath.toLowerCase().endsWith(".xml")
    ? inputPath.replace(/\.xml$/i, ".json")
    : `${inputPath}.json`;
}

export async function sitemapToJson(
  options: SitemapToJsonOptions,
): Promise<void> {
  const {
    inputPath,
    outputPath: customOutputPath,
    includePatterns = [],
    excludePatterns = [],
  } = options;

  console.log(`Procesando: ${inputPath}`);

  let result;
  try {
    result = await processSitemap(inputPath);
  } catch (err) {
    console.error(`Error al procesar el sitemap: ${(err as Error).message}`);
    throw new Error(`Error al procesar el sitemap: ${(err as Error).message}`);
  }

  console.log(`Fuente detectada: ${result.source}`);

  const { urls } = result;

  // Filtrar URLs
  const { filteredUrls, urlsBeforeInclude } = filterUrls(
    urls,
    includePatterns,
    excludePatterns,
  );

  if (filteredUrls.length === 0) {
    console.error(
      "No se encontraron URLs en el sitemap (o todas fueron filtradas)",
    );
    throw new Error(
      "No se encontraron URLs en el sitemap (o todas fueron filtradas)",
    );
  }

  // Crear objeto JSON con la estructura solicitada
  const jsonOutput = { urls: filteredUrls };

  const outputPath = customOutputPath || generateOutputPath(inputPath);
  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  try {
    await fs.promises.writeFile(
      fullOutputPath,
      JSON.stringify(jsonOutput, null, 2),
      "utf8",
    );

    console.log(`Archivo JSON creado exitosamente: ${outputPath}`);
    console.log(
      `Se extrajeron ${filteredUrls.length} URLs (de ${urlsBeforeInclude} originales)`,
    );
  } catch (err) {
    console.error(
      `Error al escribir el archivo JSON: ${(err as Error).message}`,
    );
    throw new Error(
      `Error al escribir el archivo JSON: ${(err as Error).message}`,
    );
  }
}
