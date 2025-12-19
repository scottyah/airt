import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// Compression middleware for better performance
app.use(compression());

// Serve static files from public directory
const publicPath = join(__dirname, '..', 'public');
app.use(express.static(publicPath, {
  maxAge: '1h',
  etag: true,
  lastModified: true
}));

// Serve library files with longer cache for CDN fallbacks
const libPath = join(publicPath, 'lib');
app.use('/lib', express.static(libPath, {
  maxAge: '1y',
  immutable: true
}));

// SPA fallback - serve index.html for all routes
// This enables clean URLs like /mandelbrot instead of /#/mandelbrot
app.get('*', (req, res) => {
  res.sendFile(join(publicPath, 'index.html'));
});

// Start server
app.listen(PORT, HOSTNAME, () => {
  console.log(`🎨 AIRT server running at http://${HOSTNAME}:${PORT}`);
  console.log(`📁 Serving files from: ${publicPath}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
