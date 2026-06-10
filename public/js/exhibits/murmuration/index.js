// Murmuration Exhibit
// Hundreds of starlings flock across a dusk sky using classic boids rules
// (separation, alignment, cohesion) accelerated by a spatial hash grid.
// The cursor acts as a falcon; clicks send shockwaves through the flock.

const MAX_BIRDS = 1500;
const PERCEPTION = 52;        // neighbor sense radius (CSS px)
const SEP_RADIUS = 20;        // personal space radius
const MAX_NEIGHBORS = 24;     // cap neighbor checks per bird
const FALCON_RADIUS = 130;    // flee radius around the cursor
const EDGE_MARGIN = 90;       // soft boundary that steers birds back

export default class MurmurationExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.canvas = null;
    this.ctx = null;
    this.skyCanvas = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Tunable parameters (exposed as controls)
    this.flockSize = 700;
    this.cohesionStrength = 1.0;
    this.maxSpeed = 3.2;

    // Bird state (struct-of-arrays for cache-friendly iteration)
    this.x = new Float32Array(MAX_BIRDS);
    this.y = new Float32Array(MAX_BIRDS);
    this.vx = new Float32Array(MAX_BIRDS);
    this.vy = new Float32Array(MAX_BIRDS);
    this.depth = new Float32Array(MAX_BIRDS); // 0.4..1, render-only parallax
    this.band = new Uint8Array(MAX_BIRDS);    // depth band for batched strokes
    this.count = 0;

    // Spatial hash grid (counting sort, no per-frame allocation)
    this.gridCols = 0;
    this.gridRows = 0;
    this.cellOf = new Int32Array(MAX_BIRDS);
    this.cellStart = null;
    this.gridIndices = new Int32Array(MAX_BIRDS);

    // Interaction
    this.falcon = null; // {x, y} or null when cursor is away
    this.time = 0;

    this.rect = { left: 0, top: 0, width: 0, height: 0 };

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
  }

  async init() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.skyCanvas = document.createElement('canvas');

    this.resize();
    this.spawnBirds(this.flockSize);

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);

    this.createFPSCounter();
    this.createControls();
  }

  spawnBirds(target) {
    const w = this.rect.width;
    const h = this.rect.height;

    // New birds appear in a loose cloud so the flock forms quickly
    const cx = this.count > 0 ? this.x[0] : w / 2;
    const cy = this.count > 0 ? this.y[0] : h / 2;

    while (this.count < target) {
      const i = this.count++;
      this.x[i] = cx + (Math.random() - 0.5) * w * 0.5;
      this.y[i] = cy + (Math.random() - 0.5) * h * 0.5;
      const a = Math.random() * Math.PI * 2;
      this.vx[i] = Math.cos(a) * 2;
      this.vy[i] = Math.sin(a) * 2;
      const z = 0.4 + Math.random() * 0.6;
      this.depth[i] = z;
      this.band[i] = z < 0.6 ? 0 : z < 0.8 ? 1 : 2;
    }
    this.count = target;
  }

  handlePointerMove(e) {
    this.falcon = {
      x: e.clientX - this.rect.left,
      y: e.clientY - this.rect.top
    };
  }

  handlePointerDown(e) {
    const px = e.clientX - this.rect.left;
    const py = e.clientY - this.rect.top;
    const radius = 220;

    // Shockwave: outward impulse that decays with distance
    for (let i = 0; i < this.count; i++) {
      const dx = this.x[i] - px;
      const dy = this.y[i] - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < radius && d > 0.001) {
        const force = (1 - d / radius) * 8;
        this.vx[i] += (dx / d) * force;
        this.vy[i] += (dy / d) * force;
      }
    }
  }

  handlePointerLeave() {
    this.falcon = null;
  }

  buildGrid() {
    const cols = this.gridCols;
    const cellStart = this.cellStart;
    cellStart.fill(0);

    // Count birds per cell
    for (let i = 0; i < this.count; i++) {
      let gx = (this.x[i] / PERCEPTION) | 0;
      let gy = (this.y[i] / PERCEPTION) | 0;
      gx = gx < 0 ? 0 : gx >= cols ? cols - 1 : gx;
      gy = gy < 0 ? 0 : gy >= this.gridRows ? this.gridRows - 1 : gy;
      const cell = gy * cols + gx;
      this.cellOf[i] = cell;
      cellStart[cell + 1]++;
    }

    // Prefix sums → cell start offsets
    for (let c = 1; c < cellStart.length; c++) {
      cellStart[c] += cellStart[c - 1];
    }

    // Scatter bird indices into grid order
    const cursor = new Int32Array(cols * this.gridRows);
    for (let i = 0; i < this.count; i++) {
      const cell = this.cellOf[i];
      this.gridIndices[cellStart[cell] + cursor[cell]++] = i;
    }
  }

  updateFlock() {
    this.buildGrid();

    const w = this.rect.width;
    const h = this.rect.height;
    const cols = this.gridCols;
    const rows = this.gridRows;
    const maxSpeed = this.maxSpeed;
    const minSpeed = 1.4;
    const maxForce = 0.12;
    const sepRadiusSq = SEP_RADIUS * SEP_RADIUS;
    const perceptionSq = PERCEPTION * PERCEPTION;

    // A slow wandering target keeps the whole flock sweeping the sky
    const tx = w / 2 + Math.cos(this.time * 0.13) * w * 0.28;
    const ty = h / 2 + Math.sin(this.time * 0.17) * h * 0.22;

    for (let i = 0; i < this.count; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      let ax = 0;
      let ay = 0;

      // Gather neighbors from the surrounding 3x3 grid cells
      let n = 0;
      let sumVx = 0, sumVy = 0, sumX = 0, sumY = 0;
      let sepX = 0, sepY = 0;

      const gx = Math.min(cols - 1, Math.max(0, (xi / PERCEPTION) | 0));
      const gy = Math.min(rows - 1, Math.max(0, (yi / PERCEPTION) | 0));

      outer:
      for (let cy = Math.max(0, gy - 1); cy <= Math.min(rows - 1, gy + 1); cy++) {
        for (let cx = Math.max(0, gx - 1); cx <= Math.min(cols - 1, gx + 1); cx++) {
          const cell = cy * cols + cx;
          const end = this.cellStart[cell + 1];
          for (let k = this.cellStart[cell]; k < end; k++) {
            const j = this.gridIndices[k];
            if (j === i) continue;
            const dx = this.x[j] - xi;
            const dy = this.y[j] - yi;
            const dSq = dx * dx + dy * dy;
            if (dSq > perceptionSq) continue;

            sumVx += this.vx[j];
            sumVy += this.vy[j];
            sumX += this.x[j];
            sumY += this.y[j];
            if (dSq < sepRadiusSq && dSq > 0.0001) {
              const inv = 1 / dSq;
              sepX -= dx * inv;
              sepY -= dy * inv;
            }
            if (++n >= MAX_NEIGHBORS) break outer;
          }
        }
      }

      const vxi = this.vx[i];
      const vyi = this.vy[i];

      if (n > 0) {
        // Alignment: steer toward average neighbor heading
        let dvx = sumVx / n;
        let dvy = sumVy / n;
        let mag = Math.sqrt(dvx * dvx + dvy * dvy) || 1;
        let sx = (dvx / mag) * maxSpeed - vxi;
        let sy = (dvy / mag) * maxSpeed - vyi;
        mag = Math.sqrt(sx * sx + sy * sy);
        if (mag > maxForce) { sx = (sx / mag) * maxForce; sy = (sy / mag) * maxForce; }
        ax += sx * 0.9;
        ay += sy * 0.9;

        // Cohesion: steer toward local center of mass
        dvx = sumX / n - xi;
        dvy = sumY / n - yi;
        mag = Math.sqrt(dvx * dvx + dvy * dvy) || 1;
        sx = (dvx / mag) * maxSpeed - vxi;
        sy = (dvy / mag) * maxSpeed - vyi;
        mag = Math.sqrt(sx * sx + sy * sy);
        if (mag > maxForce) { sx = (sx / mag) * maxForce; sy = (sy / mag) * maxForce; }
        ax += sx * 0.55 * this.cohesionStrength;
        ay += sy * 0.55 * this.cohesionStrength;

        // Separation: steer away from crowded neighbors
        mag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (mag > 0.0001) {
          sx = (sepX / mag) * maxSpeed - vxi;
          sy = (sepY / mag) * maxSpeed - vyi;
          mag = Math.sqrt(sx * sx + sy * sy);
          if (mag > maxForce) { sx = (sx / mag) * maxForce; sy = (sy / mag) * maxForce; }
          ax += sx * 1.6;
          ay += sy * 1.6;
        }
      }

      // Flee the falcon (cursor), with force rising sharply when close
      if (this.falcon) {
        const dx = xi - this.falcon.x;
        const dy = yi - this.falcon.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < FALCON_RADIUS && d > 0.001) {
          const force = Math.pow(1 - d / FALCON_RADIUS, 2) * 0.9;
          ax += (dx / d) * force;
          ay += (dy / d) * force;
        }
      }

      // Drift toward the wandering target so the flock roams the sky
      {
        const dx = tx - xi;
        const dy = ty - yi;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        ax += (dx / d) * 0.012;
        ay += (dy / d) * 0.012;
      }

      // Soft boundaries: turn back when entering the margin
      if (xi < EDGE_MARGIN) ax += ((EDGE_MARGIN - xi) / EDGE_MARGIN) * 0.25;
      if (xi > w - EDGE_MARGIN) ax -= ((xi - (w - EDGE_MARGIN)) / EDGE_MARGIN) * 0.25;
      if (yi < EDGE_MARGIN) ay += ((EDGE_MARGIN - yi) / EDGE_MARGIN) * 0.25;
      if (yi > h - EDGE_MARGIN) ay -= ((yi - (h - EDGE_MARGIN)) / EDGE_MARGIN) * 0.25;

      // Gentle spatially-varying wind for organic waviness
      ax += Math.sin(this.time * 0.7 + yi * 0.004) * 0.01;
      ay += Math.cos(this.time * 0.5 + xi * 0.004) * 0.008;

      // Integrate with speed clamping (birds never stall mid-air)
      let nvx = vxi + ax;
      let nvy = vyi + ay;
      const speed = Math.sqrt(nvx * nvx + nvy * nvy) || 1;
      const clamped = speed > maxSpeed ? maxSpeed : speed < minSpeed ? minSpeed : speed;
      nvx = (nvx / speed) * clamped;
      nvy = (nvy / speed) * clamped;

      this.vx[i] = nvx;
      this.vy[i] = nvy;
      this.x[i] = xi + nvx;
      this.y[i] = yi + nvy;
    }

    this.time += 0.016;
  }

  renderSky() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.rect.width;
    const h = this.rect.height;
    this.skyCanvas.width = w * dpr;
    this.skyCanvas.height = h * dpr;
    const sky = this.skyCanvas.getContext('2d');
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dusk gradient: deep indigo down to an amber horizon
    const grad = sky.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#100b26');
    grad.addColorStop(0.45, '#2c1b4d');
    grad.addColorStop(0.7, '#6e3160');
    grad.addColorStop(0.88, '#c75e55');
    grad.addColorStop(1, '#f2a65a');
    sky.fillStyle = grad;
    sky.fillRect(0, 0, w, h);

    // Setting sun glow, low and slightly off-center
    const sunX = w * 0.62;
    const sunY = h * 0.92;
    const sunR = Math.min(w, h) * 0.4;
    const sun = sky.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    sun.addColorStop(0, 'rgba(255, 214, 140, 0.55)');
    sun.addColorStop(0.4, 'rgba(255, 170, 110, 0.18)');
    sun.addColorStop(1, 'rgba(255, 170, 110, 0)');
    sky.fillStyle = sun;
    sky.fillRect(0, 0, w, h);

    // First stars in the darkening upper sky
    for (let i = 0; i < 90; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h * 0.5;
      const fade = 1 - sy / (h * 0.55); // stars dissolve toward the light
      sky.fillStyle = `rgba(255, 250, 235, ${(0.15 + Math.random() * 0.55) * fade})`;
      sky.beginPath();
      sky.arc(sx, sy, 0.4 + Math.random() * 0.9, 0, Math.PI * 2);
      sky.fill();
    }
  }

  render() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.skyCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Birds as oriented streaks, batched into three depth bands so each
    // band is a single stroke call (near birds: larger, darker)
    const bands = [
      { width: 1.1, alpha: 0.5, tail: 2.4 },
      { width: 1.6, alpha: 0.75, tail: 3.2 },
      { width: 2.2, alpha: 0.95, tail: 4.0 }
    ];

    ctx.lineCap = 'round';
    for (let b = 0; b < 3; b++) {
      const { width, alpha, tail } = bands[b];
      ctx.strokeStyle = `rgba(18, 11, 33, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < this.count; i++) {
        if (this.band[i] !== b) continue;
        const px = this.x[i];
        const py = this.y[i];
        ctx.moveTo(px - this.vx[i] * tail, py - this.vy[i] * tail);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
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

    // Flock size control
    const flockSlider = document.createElement('div');
    flockSlider.className = 'control-slider';
    flockSlider.innerHTML = `
      <label>Birds</label>
      <input type="range" id="murm-flock-slider" min="100" max="${MAX_BIRDS}" value="${this.flockSize}" step="50">
      <span id="murm-flock-value">${this.flockSize}</span>
    `;
    controlsContainer.appendChild(flockSlider);

    document.getElementById('murm-flock-slider')?.addEventListener('input', (e) => {
      this.flockSize = parseInt(e.target.value);
      document.getElementById('murm-flock-value').textContent = this.flockSize;
      if (this.flockSize > this.count) {
        this.spawnBirds(this.flockSize);
      } else {
        this.count = this.flockSize;
      }
    });

    // Cohesion control
    const cohesionSlider = document.createElement('div');
    cohesionSlider.className = 'control-slider';
    cohesionSlider.innerHTML = `
      <label>Cohesion</label>
      <input type="range" id="murm-cohesion-slider" min="0.2" max="2" value="${this.cohesionStrength}" step="0.1">
      <span id="murm-cohesion-value">${this.cohesionStrength.toFixed(1)}</span>
    `;
    controlsContainer.appendChild(cohesionSlider);

    document.getElementById('murm-cohesion-slider')?.addEventListener('input', (e) => {
      this.cohesionStrength = parseFloat(e.target.value);
      document.getElementById('murm-cohesion-value').textContent = this.cohesionStrength.toFixed(1);
    });

    // Speed control
    const speedSlider = document.createElement('div');
    speedSlider.className = 'control-slider';
    speedSlider.innerHTML = `
      <label>Speed</label>
      <input type="range" id="murm-speed-slider" min="1.5" max="5" value="${this.maxSpeed}" step="0.1">
      <span id="murm-speed-value">${this.maxSpeed.toFixed(1)}</span>
    `;
    controlsContainer.appendChild(speedSlider);

    document.getElementById('murm-speed-slider')?.addEventListener('input', (e) => {
      this.maxSpeed = parseFloat(e.target.value);
      document.getElementById('murm-speed-value').textContent = this.maxSpeed.toFixed(1);
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
    resetBtn.title = 'Reset flock';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
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
    this.rect = rect;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.gridCols = Math.max(1, Math.ceil(rect.width / PERCEPTION));
    this.gridRows = Math.max(1, Math.ceil(rect.height / PERCEPTION));
    this.cellStart = new Int32Array(this.gridCols * this.gridRows + 1);

    // Keep existing birds inside the new bounds
    for (let i = 0; i < this.count; i++) {
      if (this.x[i] > rect.width) this.x[i] = rect.width - EDGE_MARGIN;
      if (this.y[i] > rect.height) this.y[i] = rect.height - EDGE_MARGIN;
    }

    this.renderSky();
  }

  start() {
    this.isRunning = true;
    this.animate();
  }

  animate() {
    if (!this.isRunning || this.isPaused) return;

    this.updateFlock();
    this.render();
    this.updateFPS();

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
    this.flockSize = 700;
    this.cohesionStrength = 1.0;
    this.maxSpeed = 3.2;
    this.count = 0;
    this.time = 0;
    this.spawnBirds(this.flockSize);

    const flockSlider = document.getElementById('murm-flock-slider');
    const cohesionSlider = document.getElementById('murm-cohesion-slider');
    const speedSlider = document.getElementById('murm-speed-slider');

    if (flockSlider) flockSlider.value = '700';
    if (cohesionSlider) cohesionSlider.value = '1';
    if (speedSlider) speedSlider.value = '3.2';

    const flockVal = document.getElementById('murm-flock-value');
    const cohesionVal = document.getElementById('murm-cohesion-value');
    const speedVal = document.getElementById('murm-speed-value');

    if (flockVal) flockVal.textContent = '700';
    if (cohesionVal) cohesionVal.textContent = '1.0';
    if (speedVal) speedVal.textContent = '3.2';
  }

  destroy() {
    this.stop();

    if (this.canvas) {
      this.canvas.removeEventListener('pointermove', this.handlePointerMove);
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
      this.canvas.remove();
    }
    if (this.fpsElement) this.fpsElement.remove();

    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) controlsContainer.innerHTML = '';
  }
}
