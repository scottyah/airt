// Julia Set Explorer
// Watch Julia sets morph through parameter space with animated transitions

export default class JuliaSetExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;
    this.animationId = null;
    this.isRunning = false;
    this.isAnimating = true;
    this.isPaused = false;

    // Julia set parameters
    // Interesting c values that create beautiful Julia sets
    this.cValues = [
      { real: -0.7, imag: 0.27 },      // Classic spiral
      { real: -0.4, imag: 0.6 },       // Dendrite-like
      { real: 0.285, imag: 0.01 },     // Seahorse-like
      { real: -0.8, imag: 0.156 },     // Twisty spiral
      { real: -0.162, imag: 1.04 },    // Dragon-like
      { real: 0.3, imag: 0.5 }         // Galaxy-like
    ];

    this.currentCIndex = 0;
    this.cReal = this.cValues[0].real;
    this.cImag = this.cValues[0].imag;
    this.animationTime = 0;
    this.animationDuration = 3000; // 3 seconds per Julia set

    // Rendering parameters
    this.maxIterations = 256;
    this.colorOffset = 0;
    this.zoomLevel = 1;

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
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('resize', this.handleResize.bind(this));

    // Create FPS counter
    this.createFPSCounter();

    // Create controls
    this.createControls();

    // Initial render
    this.render();
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

    // Animation toggle
    const animToggle = document.createElement('button');
    animToggle.className = 'control-button';
    animToggle.id = 'anim-toggle';
    animToggle.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    `;
    animToggle.title = 'Toggle animation (Space)';
    animToggle.addEventListener('click', () => this.toggleAnimation());
    controlsContainer.appendChild(animToggle);

    // Detail control
    const detailSlider = document.createElement('div');
    detailSlider.className = 'control-slider';
    detailSlider.innerHTML = `
      <label>Detail</label>
      <input type="range" id="detail-slider" min="64" max="512" value="256" step="64">
    `;
    controlsContainer.appendChild(detailSlider);

    document.getElementById('detail-slider')?.addEventListener('input', (e) => {
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
    resetBtn.title = 'Reset (R)';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
  }

  handleClick(e) {
    // Toggle animation on click
    this.toggleAnimation();
  }

  handleKeyDown(e) {
    if (e.key === 'r' || e.key === 'R') {
      this.reset();
    } else if (e.key === ' ') {
      e.preventDefault();
      this.toggleAnimation();
    }
  }

  handleResize() {
    this.resize();
  }

  toggleAnimation() {
    this.isAnimating = !this.isAnimating;
    const btn = document.getElementById('anim-toggle');
    if (btn) {
      if (this.isAnimating) {
        btn.classList.remove('paused');
      } else {
        btn.classList.add('paused');
      }
    }
    if (this.isRunning) {
      this.startAnimation();
    }
  }

  reset() {
    this.currentCIndex = 0;
    this.cReal = this.cValues[0].real;
    this.cImag = this.cValues[0].imag;
    this.animationTime = 0;
    this.maxIterations = 256;
    this.colorOffset = 0;
    this.zoomLevel = 1;

    // Reset sliders
    const colorSlider = document.getElementById('color-slider');
    const detailSlider = document.getElementById('detail-slider');
    if (colorSlider) colorSlider.value = '0';
    if (detailSlider) detailSlider.value = '256';

    // Reset animation button
    const btn = document.getElementById('anim-toggle');
    if (btn) btn.classList.remove('paused');

    this.isAnimating = true;
    if (this.isRunning) {
      this.render();
      this.startAnimation();
    }
  }

  // Calculate Julia set for a given point
  juliaSet(x, y) {
    let zReal = x;
    let zImag = y;
    let iteration = 0;

    while (zReal * zReal + zImag * zImag <= 4 && iteration < this.maxIterations) {
      const zRealTemp = zReal * zReal - zImag * zImag + this.cReal;
      zImag = 2 * zReal * zImag + this.cImag;
      zReal = zRealTemp;
      iteration++;
    }

    // Smooth coloring using continuous iteration count
    if (iteration < this.maxIterations) {
      const logZn = Math.log(zReal * zReal + zImag * zImag) / 2;
      const nu = Math.log(logZn / Math.log(2)) / Math.log(2);
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

  // Smoothly interpolate between two complex numbers
  interpolateC(progress) {
    const nextIndex = (this.currentCIndex + 1) % this.cValues.length;
    const current = this.cValues[this.currentCIndex];
    const next = this.cValues[nextIndex];

    // Use sine easing for smooth transitions
    const eased = Math.sin(progress * Math.PI / 2);

    this.cReal = current.real + (next.real - current.real) * eased;
    this.cImag = current.imag + (next.imag - current.imag) * eased;
  }

  render() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Fixed viewport for Julia set
    const rangeX = 3.5;
    const rangeY = 3.5;
    const minX = -rangeX / 2;
    const maxX = rangeX / 2;
    const minY = -rangeY / 2;
    const maxY = rangeY / 2;

    // Create image data
    this.imageData = this.ctx.createImageData(width, height);
    const data = this.imageData.data;

    // Render each pixel
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // Map pixel to complex plane
        const x = minX + (px / width) * (maxX - minX);
        const y = minY + (py / height) * (maxY - minY);

        // Calculate Julia set iteration
        const iteration = this.juliaSet(x, y);

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

  startAnimation() {
    const animate = () => {
      if (!this.isRunning) return;

      if (this.isAnimating) {
        this.animationTime += 16.67; // ~60fps

        if (this.animationTime >= this.animationDuration) {
          this.currentCIndex = (this.currentCIndex + 1) % this.cValues.length;
          this.animationTime = 0;
        }

        // Interpolate c parameter
        const progress = this.animationTime / this.animationDuration;
        this.interpolateC(progress);
      }

      this.render();
      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
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
    this.render();
    this.startAnimation();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
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

    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('resize', this.handleResize.bind(this));

    // Clear controls
    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) {
      controlsContainer.innerHTML = '';
    }
  }
}
