import express from 'express';
import extractFromSitemapRoute from './routes/extract-from-sitemap.js';

const app = express();
const port = 3003;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/extract-from-sitemap', extractFromSitemapRoute);

app.get('/', (req, res) => {
  res.redirect('/extract-from-sitemap');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Access http://localhost:${port}/extract-from-sitemap`);
});
