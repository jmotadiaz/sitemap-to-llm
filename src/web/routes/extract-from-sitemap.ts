import { Router, Request, Response } from 'express';
import { extractSitemap } from '../../extract-from-sitemap.js';
import path from 'path';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Extract from Sitemap</title>
      <style>
        body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"] { width: 100%; padding: 8px; box-sizing: border-box; }
        .hint { font-size: 0.85em; color: #666; margin-top: 5px; }
        button { padding: 10px 20px; background-color: #007bff; color: white; border: none; cursor: pointer; }
        button:hover { background-color: #0056b3; }
      </style>
    </head>
    <body>
      <h1>Extract from Sitemap</h1>
      <form method="POST" action="/extract-from-sitemap">
        <div class="form-group">
          <label for="input">Input (URL)</label>
          <input type="text" id="input" name="input" required placeholder="https://example.com/sitemap.xml">
          <div class="hint">Sitemap XML URL or JSON URL</div>
        </div>

        <div class="form-group">
          <label for="includePatterns">Include Patterns</label>
          <input type="text" id="includePatterns" name="includePatterns" placeholder="pattern1, pattern2">
          <div class="hint">Comma separated text patterns to include</div>
        </div>

        <div class="form-group">
          <label for="excludePatterns">Exclude Patterns</label>
          <input type="text" id="excludePatterns" name="excludePatterns" placeholder="pattern1, pattern2">
          <div class="hint">Comma separated text patterns to exclude</div>
        </div>

        <div class="form-group">
          <label for="output">Output Filename</label>
          <input type="text" id="output" name="output" value="sitemap.txt">
          <div class="hint">Desired output filename (e.g. sitemap.txt or sitemap.json)</div>
        </div>

        <button type="submit">Extract and Download</button>
      </form>
    </body>
    </html>
  `;
  res.send(html);
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { input, includePatterns, excludePatterns, output } = req.body;

    if (!input) {
      res.status(400).send('Input is required');
      return;
    }

    // Process comma separated patterns
    const includeList = includePatterns ? (includePatterns as string).split(',').map(s => s.trim()).filter(Boolean) : [];
    const excludeList = excludePatterns ? (excludePatterns as string).split(',').map(s => s.trim()).filter(Boolean) : [];
    const outputFilename = output || 'sitemap.txt';

    const result = await extractSitemap({
      inputPath: input,
      includePatterns: includeList,
      excludePatterns: excludeList,
      outputPath: outputFilename
    });

    // Determine content type based on extension
    const ext = path.extname(outputFilename).toLowerCase();
    const contentType = ext === '.json' ? 'application/json' : 'text/plain';

    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(result.content);

  } catch (err) {
    console.error(err);
    res.status(500).send(`Error processing sitemap: ${(err as Error).message}`);
  }
});

export default router;
