# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIRT is a Single Page Application (SPA) showcasing AI-generated interactive visual art including fractals, generative art, and 3D visualizations. The project is designed for Docker deployment to Kubernetes with Harbor registry.

## Development Commands

### Local Testing
```bash
# Quick start (recommended) - installs deps and runs server
./local-dev.sh

# Manual commands
cd server && npm install  # Install dependencies
npm run dev               # Run with hot reload (from root)
npm start                 # Run production mode (from root)

# Open in browser
open http://localhost:3000
```

The server runs on port 3000 by default (configurable via PORT env var). Use `local-dev.sh` for the easiest setup - it handles dependency installation automatically.

### Docker & Deployment
```bash
# Build and deploy in one command
./ship.sh

# Or use individual steps
./ship.sh --build-only   # Build and push only
./ship.sh --deploy-only  # Deploy only

# Monitoring
kubectl logs -f deployment/airt-dep -n airt  # View logs
kubectl get pods -n airt                     # Check pod status
```

## Architecture

### Server Architecture
- **Express server** (`server/server.js`): Static file server with SPA fallback
- Serves all routes to `index.html` for client-side routing (History API)
- Compression middleware for performance
- Separate caching strategies: 1h for static files, 1y for libraries

### Frontend Architecture (SPA)
The frontend is a vanilla JavaScript SPA using ES6 modules with three core systems:

1. **Router** (`public/js/core/router.js`):
   - Uses History API for clean URLs (e.g., `/mandelbrot` instead of `/#/mandelbrot`)
   - Handles browser navigation (back/forward)
   - Manages view transitions (gallery ↔ exhibit)
   - Implements keyboard shortcuts (ESC, Space, R)
   - Lifecycle: showGallery() ↔ showExhibit() with proper cleanup

2. **ExhibitLoader** (`public/js/core/exhibit-loader.js`):
   - Dynamically imports exhibit modules
   - Loads exhibit configs from JSON
   - Manages exhibit lifecycle (init → start → stop → destroy)
   - Handles window resize events
   - Ensures proper cleanup to prevent memory leaks

3. **Gallery** (`public/js/gallery.js`):
   - Landing page displaying exhibit cards
   - Client-side filtering by category and search
   - Loads exhibit metadata from registry.json and individual config.json files

### Exhibit System
Each exhibit is self-contained in `public/js/exhibits/{exhibit-id}/`:
- `index.js` - Exhibit class with lifecycle methods
- `config.json` - Metadata (title, description, category, library, thumbnail, tags, instructions)

#### Exhibit Lifecycle Methods
All exhibits must implement:
- `constructor(container, config)` - Receives DOM container and config object
- `async init()` - Setup (create canvas, initialize libraries, event listeners)
- `start()` - Begin animation loop
- `stop()` - Stop animation
- `resize()` - Handle window resize
- `reset()` - Reset to initial state
- `togglePause()` - Pause/resume (optional)
- `destroy()` - Cleanup (remove event listeners, cancel animation frames)

#### Exhibit Registration
To add a new exhibit:
1. Create directory: `public/js/exhibits/{exhibit-id}/`
2. Add `config.json` with metadata
3. Add `index.js` with exhibit class (default export)
4. Register in `public/js/exhibits/registry.json` with `"enabled": true`
5. Add thumbnail to `assets/thumbnails/{exhibit-id}.svg` or `.jpg`

### Categories
- `fractal` - Mandelbrot, Julia sets
- `generative` - Flow fields, Voronoi, Reaction-diffusion
- `3d` - Lorenz attractor, Particle galaxies
- `interactive` - General interactive art
- `emotive` - Emotion-based visualizations
- `synthesis` - Multi-technique combinations

### Libraries Used
- **Canvas API** - Performance-critical fractals (pixel-level control)
- **p5.js** - Creative coding (generative art)
- **Three.js** - 3D graphics and WebGL
- CDN fallbacks located in `public/lib/`

## Performance Targets
- 60 FPS for all exhibits
- Use `requestAnimationFrame` for animations
- Consider Web Workers for compute-intensive fractals
- Use `devicePixelRatio` for crisp rendering on high-DPI displays
- Always cleanup animation frames and event listeners in `destroy()`

## Deployment
- Container registry: `harbor.scottyah.com/scottyah/airt`
- Kubernetes namespace: `airt`
- Production URL: https://airt.scottyah.com
- Requires `harborcred` secret and `scottyah-tls` TLS secret in cluster
