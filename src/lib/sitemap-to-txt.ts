import fs from "fs";
import path from "path";
import { processSitemap, isUrl, filterUrls } from "./sitemap-utils.js";

export interface SitemapToTxtOptions {
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
      return `${filename}.txt`;
    } catch {
      return "sitemap.txt";
    }
  }

  // Para archivos locales
  return inputPath.match(/\.(xml|json)$/i)
    ? inputPath.replace(/\.(xml|json)$/i, ".txt")
    : `${inputPath}.txt`;
}

export async function sitemapToTxt(
  options: SitemapToTxtOptions,
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
    console.error("Formatos soportados:");
    console.error("  - XML: sitemap con etiquetas <loc>");
    console.error('  - JSON: { "urls": ["url1", "url2", ...] }');
    throw new Error(
      "No se encontraron URLs en el sitemap (o todas fueron filtradas)",
    );
  }

  // Crear contenido TXT con cada URL en una línea
  const txtOutput = filteredUrls.join("\n");

  const outputPath = customOutputPath || generateOutputPath(inputPath);
  const fullOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  try {
    await fs.promises.writeFile(fullOutputPath, txtOutput, "utf8");
    console.log(`Archivo TXT creado exitosamente: ${outputPath}`);
    console.log(
      `Se extrajeron ${filteredUrls.length} URLs (de ${urlsBeforeInclude} originales)`,
    );
  } catch (err) {
    console.error(
      `Error al escribir el archivo TXT: ${(err as Error).message}`,
    );
    throw new Error(
      `Error al escribir el archivo TXT: ${(err as Error).message}`,
    );
  }
}
