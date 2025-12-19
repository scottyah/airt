// Mandelbrot Set Explorer
// Interactive fractal with infinite zoom capability

export default class MandelbrotExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Mandelbrot parameters
    this.centerX = -0.5;
    this.centerY = 0;
    this.zoom = 1;
    this.maxIterations = 256;
    this.colorOffset = 0;

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
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Set up canvas size
    this.resize();

    // Add event listeners
    this.canvas.addEventListener('click', this.handleClick.bind(this));

    // Create FPS counter
    this.createFPSCounter();

    // Create controls
    this.createControls();

    // Initial render will happen in start()
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

    // Color shift control
    const colorSlider = document.createElement('div');
    colorSlider.className = 'control-slider';
    colorSlider.innerHTML = `
      <label>Color</label>
      <input type="range" id="color-slider" min="0" max="360" value="0" step="1">
    `;
    controlsContainer.appendChild(colorSlider);

    document.getElementById('color-slider')?.addEventListener('input', (e) => {
      this.colorOffset = parseInt(e.target.value);
      this.render();
    });

    // Iteration control
    const iterSlider = document.createElement('div');
    iterSlider.className = 'control-slider';
    iterSlider.innerHTML = `
      <label>Detail</label>
      <input type="range" id="iter-slider" min="64" max="512" value="256" step="64">
    `;
    controlsContainer.appendChild(iterSlider);

    document.getElementById('iter-slider')?.addEventListener('input', (e) => {
      this.maxIterations = parseInt(e.target.value);
      this.render();
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
    resetBtn.title = 'Reset view (R)';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
  }

  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert click coordinates to complex plane
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    const aspectRatio = width / height;
    const rangeX = 4 / this.zoom;
    const rangeY = rangeX / aspectRatio;

    const clickX = this.centerX + (x / width - 0.5) * rangeX;
    const clickY = this.centerY + (y / height - 0.5) * rangeY;

    // Zoom in on clicked point
    this.centerX = clickX;
    this.centerY = clickY;
    this.zoom *= 2;

    // Increase iterations for deeper zooms
    if (this.zoom > 100) {
      this.maxIterations = Math.min(512, Math.floor(256 + Math.log2(this.zoom) * 32));
    }

    this.render();
  }

  reset() {
    this.centerX = -0.5;
    this.centerY = 0;
    this.zoom = 1;
    this.maxIterations = 256;
    this.colorOffset = 0;

    // Reset sliders
    const colorSlider = document.getElementById('color-slider');
    const iterSlider = document.getElementById('iter-slider');
    if (colorSlider) colorSlider.value = '0';
    if (iterSlider) iterSlider.value = '256';

    this.render();
  }

  // Calculate Mandelbrot set membership and iteration count
  mandelbrot(cx, cy) {
    let x = 0;
    let y = 0;
    let iteration = 0;

    while (x * x + y * y <= 4 && iteration < this.maxIterations) {
      const xtemp = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = xtemp;
      iteration++;
    }

    // Smooth coloring using continuous iteration count
    if (iteration < this.maxIterations) {
      const log_zn = Math.log(x * x + y * y) / 2;
      const nu = Math.log(log_zn / Math.log(2)) / Math.log(2);
      iteration = iteration + 1 - nu;
    }

    return iteration;
  }

  // Generate color from iteration count
  getColor(iteration) {
    if (iteration >= this.maxIterations) {
      return [0, 0, 0, 255]; // Black for points in the set
    }

    // Smooth color gradients
    const t = iteration / this.maxIterations;
    const hue = (t * 360 + this.colorOffset) % 360;
    const saturation = 100;
    const lightness = t < 0.5 ? 50 + t * 50 : 100 - t * 50;

    return this.hslToRgb(hue, saturation, lightness);
  }

  hslToRgb(h, s, l) {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255];
  }

  render() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    const aspectRatio = width / height;
    const rangeX = 4 / this.zoom;
    const rangeY = rangeX / aspectRatio;

    const minX = this.centerX - rangeX / 2;
    const maxX = this.centerX + rangeX / 2;
    const minY = this.centerY - rangeY / 2;
    const maxY = this.centerY + rangeY / 2;

    // Create image data
    this.imageData = this.ctx.createImageData(width, height);
    const data = this.imageData.data;

    // Render each pixel
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // Map pixel to complex plane
        const cx = minX + (px / width) * (maxX - minX);
        const cy = minY + (py / height) * (maxY - minY);

        // Calculate Mandelbrot iteration
        const iteration = this.mandelbrot(cx, cy);

        // Get color
        const color = this.getColor(iteration);

        // Set pixel color
        const index = (py * width + px) * 4;
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
        data[index + 3] = color[3];
      }
    }

    // Draw to canvas
    this.ctx.putImageData(this.imageData, 0, 0);

    // Update FPS
    this.updateFPS();
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
    // Render asynchronously to avoid blocking
    requestAnimationFrame(() => this.render());
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
      this.render();
    }
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
