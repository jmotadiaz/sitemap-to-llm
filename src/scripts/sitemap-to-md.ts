import path from "path";
import minimist from "minimist";
import dotenv from "dotenv";
import { sitemapToMd } from "../lib/sitemap-to-md.js";

const scriptDir = __dirname || path.dirname(process.argv[1]);
dotenv.config({ path: path.join(scriptDir, "../.env") });

interface CliArgs {
  input?: string;
  output?: string;
  engine?: "fetch" | "jina" | "firecrawl";
  "title-type"?: "page" | "url";
  "target-selector"?: string;
  "remove-selector"?: string;
  "jina-api-key"?: string;
  "firecrawl-api-key"?: string;
  "include-pattern"?: string | string[];
  "exclude-pattern"?: string | string[];
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: sitemap-to-md -i <sitemap.(xml|json|url)> -o <directorio-salida> [opciones]",
  );
  console.error("\nOpciones Generales:");
  console.error(
    "  -i --input            Sitemap XML, JSON con {urls: string[]}, o URL",
  );
  console.error(
    "  -o --output           Directorio donde guardar los .md generados",
  );
  console.error(
    "  --engine              Motor de extracción: 'fetch' (default), 'jina' o 'firecrawl'",
  );
  console.error(
    "  --title-type          Tipo de título: 'page' (título de la página) o 'url' (segmento URL) [default: page]",
  );
  console.error(
    "                        Nota: Si es 'url', se añade automáticamente un prefijo numérico.",
  );
  console.error(
    "  --include-pattern     Texto para filtrar URLs que incluyan el patrón (puede repetirse)",
  );
  console.error(
    "  --exclude-pattern     Texto para excluir URLs que coincidan con el patrón (puede repetirse)",
  );

  console.error("\nOpciones Jina & Firecrawl Engine:");
  console.error(
    "  --target-selector     Selectores CSS a incluir (ej: 'main, #content')",
  );
  console.error(
    "  --remove-selector     Selectores CSS a excluir (ej: 'header, .ads, #footer')",
  );
  console.error(
    "  --jina-api-key        API Key de Jina (opcional si existe JINA_API_KEY en .env)",
  );

  console.error("\nOpciones Firecrawl Engine:");
  console.error(
    "  --firecrawl-api-key   API Key de Firecrawl (opcional si existe FIRECRAWL_API_KEY en .env)",
  );
  process.exit(exitCode);
}

const argv = minimist<CliArgs>(process.argv.slice(2), {
  alias: { i: "input", o: "output", h: "help" },
  string: [
    "input",
    "output",
    "engine",
    "title-type",
    "target-selector",
    "remove-selector",
    "jina-api-key",
    "firecrawl-api-key",
    "include-pattern",
    "exclude-pattern",
  ],
  boolean: ["help"],
});

if (argv.help || !argv.input || !argv.output) {
  printUsage(argv.help ? 0 : 1);
}

const engine = argv.engine || "fetch";
if (engine !== "fetch" && engine !== "jina" && engine !== "firecrawl") {
  console.error(
    `Error: engine debe ser 'fetch', 'jina' o 'firecrawl', recibido: '${engine}'`,
  );
  process.exit(1);
}

const titleType = argv["title-type"] || "page";
if (titleType !== "page" && titleType !== "url") {
  console.error(
    `Error: title-type debe ser 'page' o 'url', recibido: '${titleType}'`,
  );
  process.exit(1);
}

sitemapToMd({
  inputPath: argv.input!,
  outDir: argv.output!,
  engine,
  titleType,
  targetSelector: argv["target-selector"],
  removeSelector: argv["remove-selector"],
  jinaApiKey: argv["jina-api-key"],
  firecrawlApiKey: argv["firecrawl-api-key"],
  includePatterns: argv["include-pattern"],
  excludePatterns: argv["exclude-pattern"],
}).catch((err) => {
  console.error(`Error fatal: ${err.message}`);
  process.exit(1);
});
