const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname);
const ZIP_NAME = 'arena-de-honra.zip';
const ZIP_PATH = path.join(ROOT_DIR, ZIP_NAME);

app.use((req, res, next) => {
  if (
    req.path === '/server.js' ||
    req.path === '/package.json' ||
    req.path === '/package-lock.json' ||
    req.path.startsWith('/tests/')
  ) {
    return res.status(404).end();
  }
  next();
});

app.get('/arena-de-honra.zip', (_req, res) => {
  if (!fs.existsSync(ZIP_PATH)) {
    return res.status(404).end();
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.download(ZIP_PATH, ZIP_NAME);
});

app.use(
  express.static(ROOT_DIR, {
    dotfiles: 'ignore',
    extensions: ['html'],
  })
);

app.use((req, res) => {
  if (req.method === 'GET' && !path.extname(req.path)) {
    return res.sendFile(path.join(ROOT_DIR, 'index.html'));
  }
  res.status(404).end();
});

app.listen(PORT, HOST, () => {
  console.log(`Arena de Honra server listening on http://${HOST}:${PORT}`);
});
