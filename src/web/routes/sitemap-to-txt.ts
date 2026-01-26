import { Router } from "express";
import { sitemapToTxt } from "../../lib/sitemap-to-txt";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.get("/", (req, res) => {
  res.render("form-txt", { title: "Sitemap to Text", path: "/txt" });
});

router.post("/", async (req, res) => {
  const { input, include_patterns, exclude_patterns } = req.body;

  if (!input) {
    return res.status(400).send("Input URL is required");
  }

  const includePatterns = include_patterns
    ? include_patterns.split(",").map((p: string) => p.trim())
    : undefined;
  const excludePatterns = exclude_patterns
    ? exclude_patterns.split(",").map((p: string) => p.trim())
    : undefined;

  const tmpId = uuidv4();
  const outputPath = path.join(__dirname, `../../../tmp/sitemap-${tmpId}.txt`);

  // Ensure tmp dir exists
  const tmpDir = path.dirname(outputPath);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  try {
    await sitemapToTxt({
      inputPath: input,
      outputPath: outputPath,
      includePatterns,
      excludePatterns,
    });

    res.download(outputPath, "sitemap.txt", (err) => {
      if (err) {
        console.error("Download error:", err);
      }
      // Cleanup
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });
  } catch (error) {
    console.error("Error processing sitemap:", error);
    res
      .status(500)
      .send(`Error processing sitemap: ${(error as Error).message}`);
  }
});

export default router;
