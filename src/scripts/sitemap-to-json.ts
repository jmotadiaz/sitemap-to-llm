import minimist from "minimist";
import { sitemapToJson } from "../lib/sitemap-to-json.js";

interface CliArgs {
  input?: string;
  output?: string;
  "include-pattern"?: string | string[];
  "exclude-pattern"?: string | string[];
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: sitemap-to-json -i <sitemap.(xml|url)> [-o <salida.json>]",
  );
  console.error("  -i --input   Sitemap XML o URL del sitemap");
  console.error("  -o --output  Ruta de salida JSON (opcional)");
  console.error(
    "  --include-pattern     Texto para filtrar URLs que incluyan el patrón (puede repetirse)",
  );
  console.error(
    "  --exclude-pattern     Texto para excluir URLs que coincidan con el patrón (puede repetirse)",
  );
  process.exit(exitCode);
}

const argv = minimist<CliArgs>(process.argv.slice(2), {
  alias: { i: "input", o: "output", h: "help" },
  string: ["input", "output", "include-pattern", "exclude-pattern"],
  boolean: ["help"],
});

if (argv.help || !argv.input) {
  printUsage(argv.help ? 0 : 1);
}

sitemapToJson({
  inputPath: argv.input!,
  outputPath: argv.output,
  includePatterns: argv["include-pattern"],
  excludePatterns: argv["exclude-pattern"],
}).catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
