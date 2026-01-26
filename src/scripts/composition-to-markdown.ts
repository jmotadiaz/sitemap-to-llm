#!/usr/bin/env node

import path from "path";
import minimist from "minimist";
import dotenv from "dotenv";
import { compositionToMarkdown } from "../lib/composition-to-markdown.js";

const scriptDir = __dirname || path.dirname(process.argv[1]);
dotenv.config({ path: path.join(scriptDir, "../.env") });

interface CliArgs {
  input?: string;
  output?: string;
  help?: boolean;
}

function printUsage(exitCode = 1): never {
  console.error(
    "Uso: composition-to-markdown -i <composition.json> -o <directorio-salida>"
  );
  console.error("\nOpciones:");
  console.error(
    "  -i --input            Archivo JSON de composición (default: composition.json)"
  );
  console.error(
    "  -o --output           Directorio donde guardar los .md generados"
  );
  process.exit(exitCode);
}

const argv = minimist<CliArgs>(process.argv.slice(2), {
  alias: { i: "input", o: "output", h: "help" },
  string: ["input", "output"],
  boolean: ["help"],
});

if (argv.help) {
  printUsage(0);
}

compositionToMarkdown({
  inputPath: argv.input || "composition.json",
  outDir: argv.output || "output",
}).catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
