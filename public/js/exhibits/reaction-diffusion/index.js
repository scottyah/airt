// Reaction-Diffusion Exhibit
// Gray-Scott Model - Chemical pattern formation
// Demonstrates how simple rules create complex natural patterns

export default class ReactionDiffusionExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Grid dimensions (lower resolution for performance)
    this.gridWidth = 256;
    this.gridHeight = 256;

    // Chemical grids
    this.A = null; // Chemical A grid
    this.B = null; // Chemical B grid
    this.nextA = null;
    this.nextB = null;

    // Gray-Scott parameters
    this.feedRate = 0.055;
    this.killRate = 0.062;
    this.dA = 1.0; // Diffusion rate for A
    this.dB = 0.5; // Diffusion rate for B
    this.simulationSpeed = 1; // Steps per frame

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
  }

  async init() {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.container.appendChild(this.canvas);

    // Get context
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });

    // Set up canvas size
    this.resize();

    // Initialize chemical grids
    this.initializeGrids();

    // Add event listeners
    this.canvas.addEventListener('click', this.handleClick.bind(this));

    // Create FPS counter
    this.createFPSCounter();

    // Create controls
    this.createControls();
  }

  initializeGrids() {
    // Initialize A with 1.0 everywhere
    this.A = Array(this.gridWidth)
      .fill(null)
      .map(() => Array(this.gridHeight).fill(1.0));

    // Initialize B with small random patches
    this.B = Array(this.gridWidth)
      .fill(null)
      .map(() => Array(this.gridHeight).fill(0.0));

    // Seed random B in the middle area
    const centerX = Math.floor(this.gridWidth / 2);
    const centerY = Math.floor(this.gridHeight / 2);
    const seedSize = 20;

    for (let x = centerX - seedSize; x < centerX + seedSize; x++) {
      for (let y = centerY - seedSize; y < centerY + seedSize; y++) {
        if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
          this.B[x][y] = Math.random() > 0.7 ? 1.0 : 0.0;
        }
      }
    }

    // Initialize next grids for computation
    this.nextA = this.A.map(row => [...row]);
    this.nextB = this.B.map(row => [...row]);
  }

  createFPSCounter() {
    this.fpsElement = document.createElement('div');
    this.fpsElement.className = 'fps-counter good';
    this.fpsElement.textContent = '60 FPS';
    this.container.appendChild(this.fpsElement);
  }

  createControls() {
    const controlsContainer = document.getElementById('exhibit-controls');
    if (!controlsContainer) return;

    controlsContainer.innerHTML = '';

    // Feed rate control
    const feedSlider = document.createElement('div');
    feedSlider.className = 'control-slider';
    feedSlider.innerHTML = `
      <label>Feed Rate</label>
      <input type="range" id="feed-slider" min="0.01" max="0.1" value="0.055" step="0.005">
      <span id="feed-value">0.055</span>
    `;
    controlsContainer.appendChild(feedSlider);

    document.getElementById('feed-slider')?.addEventListener('input', (e) => {
      this.feedRate = parseFloat(e.target.value);
      document.getElementById('feed-value').textContent = this.feedRate.toFixed(3);
    });

    // Kill rate control
    const killSlider = document.createElement('div');
    killSlider.className = 'control-slider';
    killSlider.innerHTML = `
      <label>Kill Rate</label>
      <input type="range" id="kill-slider" min="0.01" max="0.1" value="0.062" step="0.005">
      <span id="kill-value">0.062</span>
    `;
    controlsContainer.appendChild(killSlider);

    document.getElementById('kill-slider')?.addEventListener('input', (e) => {
      this.killRate = parseFloat(e.target.value);
      document.getElementById('kill-value').textContent = this.killRate.toFixed(3);
    });

    // Speed control
    const speedSlider = document.createElement('div');
    speedSlider.className = 'control-slider';
    speedSlider.innerHTML = `
      <label>Speed</label>
      <input type="range" id="speed-slider" min="1" max="10" value="1" step="1">
      <span id="speed-value">1x</span>
    `;
    controlsContainer.appendChild(speedSlider);

    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
      this.simulationSpeed = parseInt(e.target.value);
      document.getElementById('speed-value').textContent = this.simulationSpeed + 'x';
    });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'control-button';
    resetBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
        <path d="M21 3v5h-5"/>
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
        <path d="M3 21v-5h5"/>
      </svg>
    `;
    resetBtn.title = 'Reset simulation';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
  }

  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert canvas coordinates to grid coordinates
    const gridX = Math.floor((x / rect.width) * this.gridWidth);
    const gridY = Math.floor((y / rect.height) * this.gridHeight);

    // Add B chemical at clicked location (brush size)
    const brushRadius = 10;
    for (let dx = -brushRadius; dx <= brushRadius; dx++) {
      for (let dy = -brushRadius; dy <= brushRadius; dy++) {
        const gx = gridX + dx;
        const gy = gridY + dy;

        if (gx >= 0 && gx < this.gridWidth && gy >= 0 && gy < this.gridHeight) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= brushRadius) {
            // Add B chemical with falloff
            const strength = 1.0 - dist / brushRadius;
            this.B[gx][gy] = Math.min(1.0, this.B[gx][gy] + strength);
          }
        }
      }
    }
  }

  // Calculate Laplacian (sum of neighbors - center)
  laplacian(grid, x, y) {
    const center = grid[x][y];
    const left = grid[(x - 1 + this.gridWidth) % this.gridWidth][y];
    const right = grid[(x + 1) % this.gridWidth][y];
    const up = grid[x][(y - 1 + this.gridHeight) % this.gridHeight];
    const down = grid[x][(y + 1) % this.gridHeight];

    // Weighted Laplacian kernel
    return (0.05 * (left + right + up + down - 4 * center));
  }

  // Perform one simulation step
  simulationStep() {
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridHeight; y++) {
        const a = this.A[x][y];
        const b = this.B[x][y];

        // Calculate Laplacians
        const lapA = this.laplacian(this.A, x, y);
        const lapB = this.laplacian(this.B, x, y);

        // Gray-Scott reactions
        const reaction = a * b * b;

        // Update equations
        this.nextA[x][y] = a + (this.dA * lapA) - reaction + (this.feedRate * (1.0 - a));
        this.nextB[x][y] = b + (this.dB * lapB) + reaction - ((this.killRate + this.feedRate) * b);

        // Clamp values to [0, 1]
        this.nextA[x][y] = Math.max(0, Math.min(1, this.nextA[x][y]));
        this.nextB[x][y] = Math.max(0, Math.min(1, this.nextB[x][y]));
      }
    }

    // Swap grids
    let temp = this.A;
    this.A = this.nextA;
    this.nextA = temp;

    temp = this.B;
    this.B = this.nextB;
    this.nextB = temp;
  }

  // Render the current state to canvas
  render() {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    // Create image data
    this.imageData = this.ctx.createImageData(canvasWidth, canvasHeight);
    const data = this.imageData.data;

    // Scale factors for upsampling
    const scaleX = canvasWidth / this.gridWidth;
    const scaleY = canvasHeight / this.gridHeight;

    // Render each grid cell upsampled to canvas
    for (let gridX = 0; gridX < this.gridWidth; gridX++) {
      for (let gridY = 0; gridY < this.gridHeight; gridY++) {
        const b = this.B[gridX][gridY];
        const a = this.A[gridX][gridY];

        // Color based on B concentration with some A influence
        const color = this.getColor(b, a);

        // Fill the upsampled region
        const startCanvasX = Math.floor(gridX * scaleX);
        const startCanvasY = Math.floor(gridY * scaleY);
        const endCanvasX = Math.floor((gridX + 1) * scaleX);
        const endCanvasY = Math.floor((gridY + 1) * scaleY);

        for (let px = startCanvasX; px < endCanvasX; px++) {
          for (let py = startCanvasY; py < endCanvasY; py++) {
            if (px >= 0 && px < canvasWidth && py >= 0 && py < canvasHeight) {
              const index = (py * canvasWidth + px) * 4;
              data[index] = color[0];
              data[index + 1] = color[1];
              data[index + 2] = color[2];
              data[index + 3] = color[3];
            }
          }
        }
      }
    }

    // Draw to canvas
    this.ctx.putImageData(this.imageData, 0, 0);

    // Update FPS
    this.updateFPS();
  }

  // Get color based on chemical concentrations
  getColor(b, a) {
    // Map B concentration to colors
    // Low B: blue/purple
    // Mid B: cyan
    // High B: yellow/white

    if (b < 0.1) {
      // Deep blue for low B
      return [20, 40, 100, 255];
    } else if (b < 0.3) {
      // Blue to cyan
      const t = (b - 0.1) / 0.2;
      return [
        Math.round(20 + t * 100),
        Math.round(40 + t * 150),
        Math.round(100 - t * 50),
        255
      ];
    } else if (b < 0.5) {
      // Cyan to green
      const t = (b - 0.3) / 0.2;
      return [
        Math.round(120 - t * 120),
        Math.round(190 - t * 50),
        Math.round(50 + t * 100),
        255
      ];
    } else if (b < 0.7) {
      // Green to yellow
      const t = (b - 0.5) / 0.2;
      return [
        Math.round(t * 200),
        Math.round(140 + t * 115),
        Math.round(150 - t * 150),
        255
      ];
    } else {
      // Yellow to white
      const t = (b - 0.7) / 0.3;
      return [
        Math.round(200 + t * 55),
        Math.round(255),
        Math.round(t * 255),
        255
      ];
    }
  }

  updateFPS() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastTime = now;

      if (this.fpsElement) {
        this.fpsElement.textContent = `${this.fps} FPS`;
        this.fpsElement.className = 'fps-counter ' +
          (this.fps >= 45 ? 'good' : this.fps >= 25 ? 'medium' : 'poor');
      }
    }
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    if (this.isRunning) {
      this.render();
    }
  }

  start() {
    this.isRunning = true;
    this.animate();
  }

  animate() {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    // Run multiple simulation steps per frame for speed control
    for (let i = 0; i < this.simulationSpeed; i++) {
      this.simulationStep();
    }

    // Render the current state
    this.render();

    // Schedule next frame
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  stop() {
    this.isRunning = false;
    this.isPaused = true;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (!this.isPaused) {
      this.animate();
    }
  }

  reset() {
    this.initializeGrids();
    this.feedRate = 0.055;
    this.killRate = 0.062;
    this.simulationSpeed = 1;

    // Reset sliders
    const feedSlider = document.getElementById('feed-slider');
    const killSlider = document.getElementById('kill-slider');
    const speedSlider = document.getElementById('speed-slider');
    const feedValue = document.getElementById('feed-value');
    const killValue = document.getElementById('kill-value');
    const speedValue = document.getElementById('speed-value');

    if (feedSlider) feedSlider.value = '0.055';
    if (killSlider) killSlider.value = '0.062';
    if (speedSlider) speedSlider.value = '1';
    if (feedValue) feedValue.textContent = '0.055';
    if (killValue) killValue.textContent = '0.062';
    if (speedValue) speedValue.textContent = '1x';

    this.render();
  }

  destroy() {
    this.stop();

    if (this.canvas) {
      this.canvas.remove();
    }

    if (this.fpsElement) {
      this.fpsElement.remove();
    }

    // Clear controls
    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) {
      controlsContainer.innerHTML = '';
    }
  }
}
