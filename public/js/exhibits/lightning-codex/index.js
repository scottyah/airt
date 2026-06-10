// Lightning Codex Exhibit
// A time-based storm. Charge accumulates in the cloud deck while the
// equations physics uses to describe lightning swirl dimly inside it. When
// the field exceeds the breakdown threshold a fractal bolt (recursive
// midpoint displacement with branching) discharges — and the white-hot core
// of the main channel is typeset from those same equations, glyph by glyph,
// laid along the channel's arc length.

const FORMULAS = [
  '∇·E = ρ/ε₀',
  '∇×B = μ₀J + μ₀ε₀ ∂E/∂t',
  'E_breakdown ≈ 3×10⁶ V/m',
  'dn/dt = αn − ηn',
  'T_channel ≈ 3×10⁴ K',
  'I_peak ≈ 30 kA',
  'Q ≈ 15 C',
  'E ≈ 10⁹ J',
  'v_leader ≈ 2×10⁵ m/s',
  'd = 343 m/s × t_thunder',
  'P = ε₀E²/2',
  'V ≈ 10⁸ V',
  'D_fractal ≈ 1.7',
  'λ_D = √(ε₀kT/nq²)',
  'E = E₀δ(1 + 0.308/√(δr))',
  'σ ∝ T^(3/2)',
  'j = nqv_d',
  '∇²V = −ρ/ε₀'
];

export default class LightningCodexExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.canvas = null;
    this.ctx = null;
    this.skyCanvas = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Tunable parameters
    this.intensity = 1.0;   // storm cycle speed
    this.branching = 1.0;   // branch density

    // Storm state
    this.charge = 0;        // 0..1, builds until breakdown
    this.bolts = [];        // active strikes with decaying life
    this.flash = 0;         // full-screen flash alpha
    this.time = 0;
    this.rodX = null;       // cursor-positioned lightning rod

    // Ambient formulas swirling in the cloud (the "knowledge" charging up)
    this.cloudFormulas = [];

    // Rain
    this.rain = null;

    this.rect = { left: 0, top: 0, width: 1, height: 1 };

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
    this.initCloudFormulas();
    this.initRain();

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);

    this.createFPSCounter();
    this.createControls();
  }

  cloudBase() {
    return this.rect.height * 0.24;
  }

  groundY() {
    return this.rect.height * 0.93;
  }

  initCloudFormulas() {
    this.cloudFormulas = [];
    const w = this.rect.width;
    for (let i = 0; i < 14; i++) {
      this.cloudFormulas.push({
        text: FORMULAS[i % FORMULAS.length],
        x: Math.random() * w,
        y: this.rect.height * (0.04 + Math.random() * 0.16),
        drift: 0.1 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        size: 11 + Math.random() * 6
      });
    }
  }

  initRain() {
    const n = 260;
    this.rain = {
      x: new Float32Array(n),
      y: new Float32Array(n),
      speed: new Float32Array(n),
      len: new Float32Array(n),
      n
    };
    for (let i = 0; i < n; i++) this.resetDrop(i, true);
  }

  resetDrop(i, anywhere) {
    const r = this.rain;
    r.x[i] = Math.random() * (this.rect.width + 100) - 50;
    r.y[i] = anywhere ? Math.random() * this.rect.height : this.cloudBase() * Math.random();
    r.speed[i] = 9 + Math.random() * 7;
    r.len[i] = 10 + Math.random() * 14;
  }

  handlePointerMove(e) {
    this.rodX = e.clientX - this.rect.left;
  }

  handlePointerDown(e) {
    const x = e.clientX - this.rect.left;
    // A called strike discharges whatever charge has built up
    this.strike(x, Math.max(0.55, this.charge));
    this.charge = 0;
  }

  handlePointerLeave() {
    this.rodX = null;
  }

  // --- Bolt generation: recursive midpoint displacement ---

  generateChannel(x0, y0, x1, y1, roughness) {
    let points = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
    let offset = Math.hypot(x1 - x0, y1 - y0) * roughness;

    for (let iter = 0; iter < 8; iter++) {
      const next = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        // Displace perpendicular to the segment
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const d = (Math.random() - 0.5) * 2 * offset;
        next.push({ x: mx + (-dy / len) * d, y: my + (dx / len) * d });
        next.push(b);
      }
      points = next;
      offset *= 0.55;
    }
    return points;
  }

  strike(targetX, power) {
    const w = this.rect.width;
    const cloudY = this.cloudBase() * (0.5 + Math.random() * 0.5);
    const startX = targetX + (Math.random() - 0.5) * w * 0.25;
    const main = this.generateChannel(startX, cloudY, targetX, this.groundY(), 0.18);

    // Branches: forks that peel off the main channel partway down
    const branches = [];
    const branchCount = Math.round((2 + Math.random() * 3) * this.branching);
    for (let b = 0; b < branchCount; b++) {
      const idx = Math.floor(main.length * (0.15 + Math.random() * 0.55));
      const origin = main[idx];
      const remaining = this.groundY() - origin.y;
      const angle = (Math.random() - 0.5) * 1.6;
      const blen = remaining * (0.25 + Math.random() * 0.4);
      branches.push({
        points: this.generateChannel(
          origin.x, origin.y,
          origin.x + Math.sin(angle) * blen,
          origin.y + Math.cos(angle) * blen * 0.8,
          0.28
        ),
        dim: 0.35 + Math.random() * 0.25
      });
    }

    // Typeset formulas along the main channel's arc length
    const glyphs = [];
    const arc = [0];
    for (let i = 1; i < main.length; i++) {
      arc.push(arc[i - 1] + Math.hypot(main[i].x - main[i - 1].x, main[i].y - main[i - 1].y));
    }
    const totalLen = arc[arc.length - 1];

    let cursor = 24;
    let fi = Math.floor(Math.random() * FORMULAS.length);
    while (cursor < totalLen - 30) {
      const text = FORMULAS[fi % FORMULAS.length];
      fi += 1 + Math.floor(Math.random() * 3);
      for (const ch of text) {
        if (cursor >= totalLen - 20) break;
        // Locate the channel point at this arc distance
        let seg = 1;
        while (seg < arc.length - 1 && arc[seg] < cursor) seg++;
        const t = (cursor - arc[seg - 1]) / ((arc[seg] - arc[seg - 1]) || 1);
        const px = main[seg - 1].x + (main[seg].x - main[seg - 1].x) * t;
        const py = main[seg - 1].y + (main[seg].y - main[seg - 1].y) * t;
        const ang = Math.atan2(main[seg].y - main[seg - 1].y, main[seg].x - main[seg - 1].x);
        glyphs.push({ ch, x: px, y: py, ang });
        cursor += 11;
      }
      cursor += 30; // gap between formulas
    }

    this.bolts.push({ main, branches, glyphs, power, life: 1 });
    this.flash = Math.min(1, this.flash + 0.55 * power);
  }

  update() {
    const dt = 0.016;
    this.time += dt;

    // Charge builds; breakdown triggers an automatic strike
    this.charge += dt * 0.16 * this.intensity * (0.7 + 0.6 * Math.random());
    if (this.charge >= 1) {
      const target = this.rodX !== null && Math.random() < 0.65
        ? this.rodX + (Math.random() - 0.5) * 60
        : Math.random() * this.rect.width;
      this.strike(target, 0.8 + Math.random() * 0.4);
      this.charge = 0;
    }

    // Bolt afterglow decay
    for (const bolt of this.bolts) bolt.life -= dt / 2.2;
    this.bolts = this.bolts.filter(b => b.life > 0);

    this.flash = Math.max(0, this.flash - dt * 2.4);

    // Rain falls, kicked sideways slightly by wind
    const r = this.rain;
    const wind = Math.sin(this.time * 0.4) * 1.5;
    for (let i = 0; i < r.n; i++) {
      r.y[i] += r.speed[i];
      r.x[i] += wind;
      if (r.y[i] > this.groundY()) this.resetDrop(i, false);
    }
  }

  renderSky() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.rect.width, h = this.rect.height;
    this.skyCanvas.width = w * dpr;
    this.skyCanvas.height = h * dpr;
    const sky = this.skyCanvas.getContext('2d');
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);

    const grad = sky.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0b0d18');
    grad.addColorStop(0.35, '#11142a');
    grad.addColorStop(0.8, '#1a1d33');
    grad.addColorStop(1, '#0a0b14');
    sky.fillStyle = grad;
    sky.fillRect(0, 0, w, h);

    // Cloud deck: layered dark billows along the top
    for (let layer = 0; layer < 3; layer++) {
      sky.fillStyle = `rgba(${14 + layer * 6}, ${15 + layer * 6}, ${30 + layer * 8}, 0.9)`;
      sky.beginPath();
      sky.moveTo(-50, 0);
      const baseY = this.cloudBase() * (0.55 + layer * 0.22);
      for (let x = -50; x <= w + 50; x += 30) {
        const y = baseY
          + Math.sin(x * 0.013 + layer * 2.1) * 18
          + Math.sin(x * 0.041 + layer * 4.7) * 9;
        sky.lineTo(x, y);
      }
      sky.lineTo(w + 50, 0);
      sky.closePath();
      sky.fill();
    }

    // Ground silhouette with a faint horizon line
    sky.fillStyle = '#06060c';
    sky.fillRect(0, this.groundY(), w, h - this.groundY());
    sky.strokeStyle = 'rgba(120, 130, 190, 0.18)';
    sky.lineWidth = 1;
    sky.beginPath();
    sky.moveTo(0, this.groundY());
    sky.lineTo(w, this.groundY());
    sky.stroke();
  }

  drawChannel(ctx, points, widthScale, alpha) {
    // Layered strokes: wide violet halo, blue glow, then white-hot core
    const layers = [
      { width: 11 * widthScale, color: `rgba(110, 80, 255, ${0.14 * alpha})` },
      { width: 5 * widthScale, color: `rgba(140, 170, 255, ${0.35 * alpha})` },
      { width: 1.6 * widthScale, color: `rgba(255, 255, 255, ${0.95 * alpha})` }
    ];
    for (const layer of layers) {
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
  }

  render() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.rect.width, h = this.rect.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.skyCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Cloud glow swells with stored charge
    const glowStrength = 0.05 + this.charge * 0.3 + this.flash * 0.35;
    const glow = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 0.55);
    glow.addColorStop(0, `rgba(130, 120, 255, ${glowStrength})`);
    glow.addColorStop(1, 'rgba(130, 120, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h * 0.6);

    // Pre-strike flicker inside the cloud as breakdown approaches
    if (this.charge > 0.75 && Math.random() < (this.charge - 0.75) * 0.9) {
      ctx.fillStyle = `rgba(180, 180, 255, ${0.04 + Math.random() * 0.05})`;
      ctx.fillRect(0, 0, w, this.cloudBase());
    }

    // The knowledge, brewing: equations swirl in the cloud, brightening
    // as charge builds — they are what discharges down the channel
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const f of this.cloudFormulas) {
      const x = (f.x + this.time * f.drift * 20) % (w + 200) - 100;
      const y = f.y + Math.sin(this.time * 0.5 + f.phase) * 6;
      const a = (0.06 + this.charge * 0.3) * (0.6 + 0.4 * Math.sin(this.time + f.phase));
      ctx.font = `italic ${f.size}px Georgia, serif`;
      ctx.fillStyle = `rgba(150, 160, 255, ${Math.max(0, a)})`;
      ctx.fillText(f.text, x, y);
    }

    // Rain
    const wind = Math.sin(this.time * 0.4) * 1.5;
    ctx.strokeStyle = 'rgba(150, 165, 210, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const r = this.rain;
    for (let i = 0; i < r.n; i++) {
      ctx.moveTo(r.x[i], r.y[i]);
      ctx.lineTo(r.x[i] - wind * 1.4, r.y[i] - r.len[i]);
    }
    ctx.stroke();

    // Lightning rod marker where the cursor rests
    if (this.rodX !== null) {
      const gy = this.groundY();
      ctx.strokeStyle = 'rgba(200, 210, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.rodX, gy);
      ctx.lineTo(this.rodX, gy - 26);
      ctx.stroke();
      ctx.fillStyle = `rgba(220, 225, 255, ${0.4 + this.charge * 0.6})`;
      ctx.beginPath();
      ctx.arc(this.rodX, gy - 29, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bolts: branches first, then main channel, then the formula core
    for (const bolt of this.bolts) {
      const a = Math.pow(bolt.life, 1.4) * bolt.power;

      for (const branch of bolt.branches) {
        this.drawChannel(ctx, branch.points, 0.5, a * branch.dim);
      }
      this.drawChannel(ctx, bolt.main, 1, a);

      // The codex: equation glyphs typeset along the white-hot core.
      // They outlive the channel glow slightly, as if the knowledge lingers.
      const ga = Math.min(1, bolt.life * 1.6) * bolt.power;
      ctx.font = '700 11px Georgia, serif';
      ctx.textAlign = 'center';
      for (const g of bolt.glyphs) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.ang);
        ctx.fillStyle = `rgba(80, 60, 200, ${ga * 0.5})`;
        ctx.fillText(g.ch, 0, 1.5);
        ctx.fillStyle = `rgba(255, 255, 255, ${ga})`;
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }
      ctx.textAlign = 'left';

      // Ground scorch glow at the strike point
      const tip = bolt.main[bolt.main.length - 1];
      const scorch = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 60);
      scorch.addColorStop(0, `rgba(180, 170, 255, ${a * 0.5})`);
      scorch.addColorStop(1, 'rgba(180, 170, 255, 0)');
      ctx.fillStyle = scorch;
      ctx.fillRect(tip.x - 60, tip.y - 60, 120, 120);
    }

    // Full-scene flash
    if (this.flash > 0.003) {
      ctx.fillStyle = `rgba(225, 228, 255, ${this.flash * 0.32})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Charge meter: a thin field line at the cloud base
    ctx.fillStyle = `rgba(140, 130, 255, ${0.2 + this.charge * 0.5})`;
    ctx.fillRect(0, this.cloudBase(), w * this.charge, 2);
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

    const intensitySlider = document.createElement('div');
    intensitySlider.className = 'control-slider';
    intensitySlider.innerHTML = `
      <label>Intensity</label>
      <input type="range" id="codex-intensity-slider" min="0.3" max="3" value="${this.intensity}" step="0.1">
      <span id="codex-intensity-value">${this.intensity.toFixed(1)}</span>
    `;
    controlsContainer.appendChild(intensitySlider);

    document.getElementById('codex-intensity-slider')?.addEventListener('input', (e) => {
      this.intensity = parseFloat(e.target.value);
      document.getElementById('codex-intensity-value').textContent = this.intensity.toFixed(1);
    });

    const branchSlider = document.createElement('div');
    branchSlider.className = 'control-slider';
    branchSlider.innerHTML = `
      <label>Branching</label>
      <input type="range" id="codex-branch-slider" min="0" max="2.5" value="${this.branching}" step="0.1">
      <span id="codex-branch-value">${this.branching.toFixed(1)}</span>
    `;
    controlsContainer.appendChild(branchSlider);

    document.getElementById('codex-branch-slider')?.addEventListener('input', (e) => {
      this.branching = parseFloat(e.target.value);
      document.getElementById('codex-branch-value').textContent = this.branching.toFixed(1);
    });

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
    resetBtn.title = 'Reset storm';
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

    this.renderSky();
    if (this.rain) {
      for (let i = 0; i < this.rain.n; i++) this.resetDrop(i, true);
    }
    if (this.cloudFormulas.length) this.initCloudFormulas();
  }

  start() {
    this.isRunning = true;
    this.animate();
  }

  animate() {
    if (!this.isRunning || this.isPaused) return;

    this.update();
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
    this.intensity = 1.0;
    this.branching = 1.0;
    this.charge = 0;
    this.bolts = [];
    this.flash = 0;
    this.time = 0;
    this.initCloudFormulas();

    const pairs = [
      ['codex-intensity-slider', 'codex-intensity-value', '1', '1.0'],
      ['codex-branch-slider', 'codex-branch-value', '1', '1.0']
    ];
    for (const [sliderId, valueId, sliderVal, displayVal] of pairs) {
      const slider = document.getElementById(sliderId);
      const value = document.getElementById(valueId);
      if (slider) slider.value = sliderVal;
      if (value) value.textContent = displayVal;
    }
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
