// Cosmic Spirograph Exhibit
// Orbiting arms trace intricate geometric patterns using epicycloid mathematics

export default class CosmicSpirographExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.canvas = null;
    this.trailCanvas = null;
    this.ctx = null;
    this.trailCtx = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Spirograph parameters
    this.arms = 3;
    this.speedRatio = 7;
    this.innerRatio = 0.38;
    this.trailWidth = 1.5;

    // Animation state
    this.angle = 0;
    this.speed = 0.02;
    this.prevX = null;
    this.prevY = null;
    this.hue = 0;

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
  }

  async init() {
    // Create trail canvas (persistent drawing surface)
    this.trailCanvas = document.createElement('canvas');
    this.trailCanvas.style.position = 'absolute';
    this.trailCanvas.style.top = '0';
    this.trailCanvas.style.left = '0';
    this.container.appendChild(this.trailCanvas);

    // Create overlay canvas (for arm visualization)
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.trailCtx = this.trailCanvas.getContext('2d');

    this.resize();
    this.clearTrail();

    this.canvas.addEventListener('click', this.handleClick.bind(this));

    this.createFPSCounter();
    this.createControls();
  }

  clearTrail() {
    if (!this.trailCtx) return;
    this.trailCtx.fillStyle = 'rgba(10, 10, 20, 1)';
    this.trailCtx.fillRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
    this.prevX = null;
    this.prevY = null;
    this.angle = 0;
    this.hue = 0;
  }

  handleClick() {
    this.clearTrail();
  }

  getSpirographPoint(t) {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (rect.width * dpr) / 2;
    const cy = (rect.height * dpr) / 2;
    const maxRadius = Math.min(cx, cy) * 0.85;

    let x = cx;
    let y = cy;

    // Chain of rotating arms creating epicycloid patterns
    for (let i = 0; i < this.arms; i++) {
      const radius = maxRadius * Math.pow(this.innerRatio, i);
      const armSpeed = Math.pow(this.speedRatio, i);
      const direction = i % 2 === 0 ? 1 : -1;
      x += radius * Math.cos(t * armSpeed * direction);
      y += radius * Math.sin(t * armSpeed * direction);
    }

    return { x, y };
  }

  drawArms(t) {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (rect.width * dpr) / 2;
    const cy = (rect.height * dpr) / 2;
    const maxRadius = Math.min(cx, cy) * 0.85;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;

    let x = cx;
    let y = cy;

    for (let i = 0; i < this.arms; i++) {
      const radius = maxRadius * Math.pow(this.innerRatio, i);
      const armSpeed = Math.pow(this.speedRatio, i);
      const direction = i % 2 === 0 ? 1 : -1;

      const nx = x + radius * Math.cos(t * armSpeed * direction);
      const ny = y + radius * Math.sin(t * armSpeed * direction);

      // Draw arm circle
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Draw arm line
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(nx, ny);
      this.ctx.stroke();

      x = nx;
      y = ny;
    }

    // Draw pen point
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 3, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawTrail(t) {
    const point = this.getSpirographPoint(t);

    if (this.prevX !== null && this.prevY !== null) {
      this.trailCtx.strokeStyle = `hsl(${this.hue % 360}, 85%, 60%)`;
      this.trailCtx.lineWidth = this.trailWidth * (window.devicePixelRatio || 1);
      this.trailCtx.lineCap = 'round';
      this.trailCtx.beginPath();
      this.trailCtx.moveTo(this.prevX, this.prevY);
      this.trailCtx.lineTo(point.x, point.y);
      this.trailCtx.stroke();
    }

    this.prevX = point.x;
    this.prevY = point.y;
    this.hue += 0.3;
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

    // Arms control
    const armsSlider = document.createElement('div');
    armsSlider.className = 'control-slider';
    armsSlider.innerHTML = `
      <label>Arms</label>
      <input type="range" id="arms-slider" min="2" max="6" value="${this.arms}" step="1">
      <span id="arms-value">${this.arms}</span>
    `;
    controlsContainer.appendChild(armsSlider);

    document.getElementById('arms-slider')?.addEventListener('input', (e) => {
      this.arms = parseInt(e.target.value);
      document.getElementById('arms-value').textContent = this.arms;
      this.clearTrail();
    });

    // Speed ratio control
    const ratioSlider = document.createElement('div');
    ratioSlider.className = 'control-slider';
    ratioSlider.innerHTML = `
      <label>Ratio</label>
      <input type="range" id="ratio-slider" min="2" max="13" value="${this.speedRatio}" step="1">
      <span id="ratio-value">${this.speedRatio}</span>
    `;
    controlsContainer.appendChild(ratioSlider);

    document.getElementById('ratio-slider')?.addEventListener('input', (e) => {
      this.speedRatio = parseInt(e.target.value);
      document.getElementById('ratio-value').textContent = this.speedRatio;
      this.clearTrail();
    });

    // Inner ratio control
    const innerSlider = document.createElement('div');
    innerSlider.className = 'control-slider';
    innerSlider.innerHTML = `
      <label>Size</label>
      <input type="range" id="inner-slider" min="0.2" max="0.6" value="${this.innerRatio}" step="0.02">
      <span id="inner-value">${this.innerRatio}</span>
    `;
    controlsContainer.appendChild(innerSlider);

    document.getElementById('inner-slider')?.addEventListener('input', (e) => {
      this.innerRatio = parseFloat(e.target.value);
      document.getElementById('inner-value').textContent = this.innerRatio.toFixed(2);
      this.clearTrail();
    });

    // Speed control
    const speedSlider = document.createElement('div');
    speedSlider.className = 'control-slider';
    speedSlider.innerHTML = `
      <label>Speed</label>
      <input type="range" id="spiro-speed-slider" min="0.005" max="0.05" value="${this.speed}" step="0.005">
      <span id="spiro-speed-value">${this.speed}</span>
    `;
    controlsContainer.appendChild(speedSlider);

    document.getElementById('spiro-speed-slider')?.addEventListener('input', (e) => {
      this.speed = parseFloat(e.target.value);
      document.getElementById('spiro-speed-value').textContent = this.speed.toFixed(3);
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
    resetBtn.title = 'Reset pattern';
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

    for (const c of [this.canvas, this.trailCanvas]) {
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      c.style.width = rect.width + 'px';
      c.style.height = rect.height + 'px';
    }

    this.clearTrail();
  }

  start() {
    this.isRunning = true;
    this.animate();
  }

  animate() {
    if (!this.isRunning || this.isPaused) return;

    this.angle += this.speed;
    this.drawTrail(this.angle);
    this.drawArms(this.angle);
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
    this.arms = 3;
    this.speedRatio = 7;
    this.innerRatio = 0.38;
    this.speed = 0.02;

    const armsSlider = document.getElementById('arms-slider');
    const ratioSlider = document.getElementById('ratio-slider');
    const innerSlider = document.getElementById('inner-slider');
    const speedSlider = document.getElementById('spiro-speed-slider');

    if (armsSlider) armsSlider.value = '3';
    if (ratioSlider) ratioSlider.value = '7';
    if (innerSlider) innerSlider.value = '0.38';
    if (speedSlider) speedSlider.value = '0.02';

    const armsVal = document.getElementById('arms-value');
    const ratioVal = document.getElementById('ratio-value');
    const innerVal = document.getElementById('inner-value');
    const speedVal = document.getElementById('spiro-speed-value');

    if (armsVal) armsVal.textContent = '3';
    if (ratioVal) ratioVal.textContent = '7';
    if (innerVal) innerVal.textContent = '0.38';
    if (speedVal) speedVal.textContent = '0.020';

    this.clearTrail();
  }

  destroy() {
    this.stop();

    if (this.canvas) this.canvas.remove();
    if (this.trailCanvas) this.trailCanvas.remove();
    if (this.fpsElement) this.fpsElement.remove();

    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) controlsContainer.innerHTML = '';
  }
}
