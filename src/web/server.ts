import express from "express";
import path from "path";
import { Eta } from "eta";
import { config } from "dotenv";

config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = 3003;

// Eta setup
const eta = new Eta({
  views: path.join(__dirname, "views"),
  autoEscape: false,
  useWith: true,
});

// View engine setup
app.engine(
  "eta",
  (path: string, data: any, cb: (err: Error | null, html?: string) => void) => {
    try {
      // path is absolute, but eta expects relative to views if we set views in constructor
      // simpler to just read the file content or let eta handle it if we pass the relative path
      // Express passes the absolute path to the view file
      const relativePath = path.slice(eta.config.views!.length + 1); // +1 for separator
      const html = eta.render(relativePath, data);
      cb(null, html);
    } catch (err) {
      cb(err as Error);
    }
  },
);
app.set("view engine", "eta");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

import sitemapToTxtRouter from "./routes/sitemap-to-txt";
import sitemapToJsonRouter from "./routes/sitemap-to-json";
import sitemapToMdRouter from "./routes/sitemap-to-md";

// Routes
app.use("/txt", sitemapToTxtRouter);
app.use("/json", sitemapToJsonRouter);
app.use("/md", sitemapToMdRouter);

app.get("/", (req, res) => {
  res.render("index", { title: "Sitemap Tools Dashboard", path: "/" });
});

// Global Error Handler Middleware (must be after all routes)
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).send(`Server Error: ${err.message}`);
  },
);

// Handle uncaught exceptions and unhandled promise rejections
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Don't exit the process - keep server running
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit the process - keep server running
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
