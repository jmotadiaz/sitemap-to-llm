import minimist from "minimist";
import { sitemapToTxt } from "../lib/sitemap-to-txt.js";

interface CliArgs {
  input?: string;
  output?: string;
  "include-pattern"?: string | string[];
  "exclude-pattern"?: string | string[];
  "add-md-ext"?: boolean;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: sitemap-to-txt -i <sitemap.(xml|json|url)> [-o <salida.txt>]",
  );
  console.error("  Formatos soportados:");
  console.error("    - XML: sitemap estándar con etiquetas <loc>");
  console.error('    - JSON: { "urls": ["url1", "url2", ...] }');
  console.error("    - URL: descarga el sitemap desde una URL");
  console.error(
    "  --include-pattern     Texto para filtrar URLs que incluyan el patrón (puede repetirse)",
  );
  console.error(
    "  --exclude-pattern     Texto para excluir URLs que coincidan con el patrón (puede repetirse)",
  );
  console.error("  --add-md-ext          Añade un sufijo .md a cada URL");
  process.exit(exitCode);
}

const argv = minimist<CliArgs>(process.argv.slice(2), {
  alias: { i: "input", o: "output", h: "help" },
  string: ["input", "output", "include-pattern", "exclude-pattern"],
  boolean: ["help", "add-md-ext"],
});

if (argv.help || !argv.input) {
  printUsage(argv.help ? 0 : 1);
}

sitemapToTxt({
  inputPath: argv.input!,
  outputPath: argv.output,
  includePatterns: argv["include-pattern"],
  excludePatterns: argv["exclude-pattern"],
  addMdExt: argv["add-md-ext"],
}).catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
