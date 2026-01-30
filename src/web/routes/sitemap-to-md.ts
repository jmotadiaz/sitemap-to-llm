import { Router } from "express";
import { sitemapToMd } from "../../lib/sitemap-to-md";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
import multer from "multer";

const router = Router();
const upload = multer({ dest: path.join(__dirname, "../../../tmp/uploads") });

router.get("/", (req, res) => {
  res.render("form-md", { title: "Sitemap to Markdown", path: "/md" });
});

router.post("/", upload.single("file"), async (req, res) => {
  const {
    input,
    engine,
    title_type,
    include_patterns,
    exclude_patterns,
    target_selector,
    remove_selector,
  } = req.body;
  const file = req.file;

  const inputPath = file ? file.path : input;

  if (!inputPath) {
    return res.status(400).send("Input URL or File is required");
  }

  const includePatterns = include_patterns
    ? include_patterns.split(",").map((p: string) => p.trim())
    : undefined;
  const excludePatterns = exclude_patterns
    ? exclude_patterns.split(",").map((p: string) => p.trim())
    : undefined;

  const tmpId = uuidv4();
  const outputDir = path.join(__dirname, `../../../tmp/sitemap-md-${tmpId}`);
  const zipPath = path.join(__dirname, `../../../tmp/sitemap-md-${tmpId}.zip`);

  // Ensure tmp dir exists
  const tmpBase = path.dirname(outputDir);
  if (!fs.existsSync(tmpBase)) {
    fs.mkdirSync(tmpBase, { recursive: true });
  }

  try {
    await sitemapToMd({
      inputPath: inputPath,
      outDir: outputDir,
      engine: engine || "fetch",
      titleType: title_type || "page",
      includePatterns,
      excludePatterns,
      targetSelector: target_selector || undefined,
      removeSelector: remove_selector || undefined,
    });

    // Create Zip
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => {
      res.download(zipPath, "sitemap-markdown.zip", (err) => {
        if (err) {
          console.error("Download error:", err);
        }
        // Cleanup
        try {
          if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
          }
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
          }
          if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupErr) {
          console.error("Cleanup error:", cleanupErr);
        }
      });
    });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.directory(outputDir, false);
    await archive.finalize();
  } catch (error) {
    console.error("Error processing sitemap:", error);
    // Try cleanup on error
    try {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      if (file && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch {}

    res
      .status(500)
      .send(`Error processing sitemap: ${(error as Error).message}`);
  }
});

export default router;
