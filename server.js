require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const chokidar = require('chokidar');

const authMiddleware = require('./middleware/auth');
const adminMiddleware = require('./middleware/admin');
const scanner = require('./lib/scanner');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;
const MEDIA_DIR = process.env.MEDIA_DIR || './media';

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json());

// Static files (public UI — no auth needed)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', require('./routes/auth'));
app.use('/api/folders', authMiddleware, require('./routes/folders'));
app.use('/api/media', authMiddleware, require('./routes/media'));
app.use('/api/search', authMiddleware, require('./routes/search'));
app.use('/api/favorites', authMiddleware, require('./routes/favorites'));
app.use('/api/upload', authMiddleware, require('./routes/upload'));
app.use('/api/delete', authMiddleware, require('./routes/delete'));
app.use('/api/admin', authMiddleware, adminMiddleware, require('./routes/admin'));

// SPA fallback — serve browse.html for non-API routes
app.get('/browse', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'browse.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Scan media directory
const absMediaDir = path.resolve(MEDIA_DIR);
if (!fs.existsSync(absMediaDir)) {
  fs.mkdirSync(absMediaDir, { recursive: true });
}
scanner.scanDirectory(MEDIA_DIR);

// File watcher for live updates
const watcher = chokidar.watch(absMediaDir, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
});

let debounceTimer = null;
function debounced(fn) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, 500);
}

watcher
  .on('addDir', (dirPath) => {
    const rel = path.relative(absMediaDir, dirPath).replace(/\\/g, '/');
    if (rel) debounced(() => scanner.addFolder(MEDIA_DIR, rel));
  })
  .on('unlinkDir', (dirPath) => {
    const rel = path.relative(absMediaDir, dirPath).replace(/\\/g, '/');
    if (rel) debounced(() => scanner.removeFolder(rel));
  })
  .on('add', (filePath) => {
    const rel = path.relative(absMediaDir, filePath).replace(/\\/g, '/');
    if (rel) debounced(() => scanner.addFile(MEDIA_DIR, rel));
  })
  .on('unlink', (filePath) => {
    const rel = path.relative(absMediaDir, filePath).replace(/\\/g, '/');
    if (rel) debounced(() => scanner.removeFile(rel));
  });

// Auto-purge expired soft-deleted files every hour
const { purgeExpiredFiles } = require('./routes/delete');
setInterval(purgeExpiredFiles, 60 * 60 * 1000);
purgeExpiredFiles(); // run once on startup

// Start server
const keyPath = path.join(__dirname, 'certs', 'server.key');
const certPath = path.join(__dirname, 'certs', 'server.cert');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Media Server running at https://0.0.0.0:${PORT}`);
    printLanAddress(PORT, 'https');
  });

  // HTTP redirect
  const httpApp = express();
  httpApp.get('*', (req, res) => {
    res.redirect(`https://${req.hostname}:${PORT}${req.url}`);
  });
  http.createServer(httpApp).listen(PORT + 1, '0.0.0.0', () => {
    console.log(`HTTP redirect on port ${PORT + 1}`);
  });
} else {
  console.log('No SSL certificate found, starting in HTTP mode.');
  console.log('Run "npm run setup" to generate certificates for HTTPS.');
  http.createServer(app).listen(PORT, '0.0.0.0', () => {
    console.log(`Media Server running at http://0.0.0.0:${PORT}`);
    printLanAddress(PORT, 'http');
  });
}

function printLanAddress(port, protocol) {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`LAN: ${protocol}://${iface.address}:${port}`);
      }
    }
  }
}
