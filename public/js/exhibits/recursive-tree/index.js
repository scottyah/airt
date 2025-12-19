// Recursive Tree Garden
// L-system inspired fractal tree with wind animation

export default class RecursiveTreeExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.p5Instance = null;
    this.isRunning = false;
    this.isPaused = false;
    this.time = 0;

    // Tree parameters
    this.lengthRatio = 0.67;
    this.branchAngle = 25;
    this.maxDepth = 10;
    this.windStrength = 0.3;
    this.showLeaves = true;

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
    this.fpsElement = null;
  }

  async init() {
    // Import p5.js
    const p5 = await this.loadP5();

    // Create p5 sketch
    const sketch = (p) => {
      p.setup = () => {
        const rect = this.container.getBoundingClientRect();
        const canvas = p.createCanvas(rect.width, rect.height);
        canvas.parent(this.container);
        p.background(20, 25, 35);
      };

      p.draw = () => {
        if (!this.isRunning || this.isPaused) return;

        p.background(20, 25, 35, 15); // Slight fade for smooth trails
        p.translate(p.width / 2, p.height);

        // Wind effect using sine wave
        this.time += 0.01;
        const windOffset = Math.sin(this.time * 0.5) * this.windStrength;

        // Draw multiple trees with slight variations
        p.push();
        p.translate(-120, 0);
        this.drawTree(p, 0, -p.height * 0.35, 90, 0, windOffset);
        p.pop();

        p.push();
        p.translate(0, 0);
        this.drawTree(p, 0, -p.height * 0.4, 90, 0.15, windOffset);
        p.pop();

        p.push();
        p.translate(120, 0);
        this.drawTree(p, 0, -p.height * 0.35, 90, -0.15, windOffset);
        p.pop();

        // Update FPS
        this.updateFPS();
      };

      p.windowResized = () => {
        if (this.isRunning) {
          const rect = this.container.getBoundingClientRect();
          p.resizeCanvas(rect.width, rect.height);
        }
      };
    };

    // Create p5 instance
    this.p5Instance = new p5(sketch);

    // Create FPS counter
    this.createFPSCounter();

    // Create controls
    this.createControls();

    // Start animation
    this.start();
  }

  loadP5() {
    return new Promise((resolve) => {
      if (typeof p5 !== 'undefined') {
        resolve(window.p5);
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js';
        script.onload = () => resolve(window.p5);
        document.head.appendChild(script);
      }
    });
  }

  drawTree(p, x, y, angle, variation, windOffset) {
    this.branch(p, x, y, angle + windOffset, 0, variation);
  }

  branch(p, x, y, angle, depth, variation) {
    if (depth > this.maxDepth) return;

    // Calculate branch endpoint
    let length = p.height * 0.15 * Math.pow(this.lengthRatio, depth);
    let endX = x + length * Math.cos((angle - 90) * Math.PI / 180);
    let endY = y + length * Math.sin((angle - 90) * Math.PI / 180);

    // Calculate thickness
    const thickness = Math.max(1, 8 - depth * 0.7);

    // Color gradient: brown to green
    const colorLerp = depth / this.maxDepth;
    let r, g, b;

    if (colorLerp < 0.7) {
      // Brown to dark green
      r = Math.round(139 * (1 - colorLerp * 1.2));
      g = Math.round(100 + 50 * colorLerp);
      b = Math.round(69 * (1 - colorLerp * 0.5));
    } else {
      // Dark green to light green
      r = Math.round(34 * (1 - colorLerp));
      g = Math.round(150 + 105 * colorLerp);
      b = Math.round(69 * (1 - colorLerp * 0.3));
    }

    p.stroke(r, g, b);
    p.strokeWeight(thickness);
    p.line(x, y, endX, endY);

    // Draw leaves at terminal branches
    if (depth > this.maxDepth - 2 && this.showLeaves) {
      this.drawLeaf(p, endX, endY, r, g, b);
    }

    // Recursive branching
    const leftAngle = angle + this.branchAngle + variation * 10;
    const rightAngle = angle - this.branchAngle - variation * 10;

    // Add slight randomness for organic feel
    const randomFactor = Math.random() * 0.02;

    this.branch(p, endX, endY, leftAngle + randomFactor, depth + 1, variation);
    this.branch(p, endX, endY, rightAngle - randomFactor, depth + 1, variation);
  }

  drawLeaf(p, x, y, r, g, b) {
    p.push();
    p.noStroke();
    p.fill(r, g + 30, b + 60, 200);
    p.ellipse(x, y, 4, 6);
    p.pop();
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

    // Branch angle control
    const angleControl = document.createElement('div');
    angleControl.className = 'control-slider';
    angleControl.innerHTML = `
      <label>Branch Angle</label>
      <input type="range" id="branch-angle" min="10" max="45" value="25" step="1">
      <span id="angle-value">25°</span>
    `;
    controlsContainer.appendChild(angleControl);

    document.getElementById('branch-angle')?.addEventListener('input', (e) => {
      this.branchAngle = parseFloat(e.target.value);
      document.getElementById('angle-value').textContent = `${this.branchAngle}°`;
    });

    // Wind strength control
    const windControl = document.createElement('div');
    windControl.className = 'control-slider';
    windControl.innerHTML = `
      <label>Wind Strength</label>
      <input type="range" id="wind-strength" min="0" max="1" value="0.3" step="0.05">
      <span id="wind-value">0.3</span>
    `;
    controlsContainer.appendChild(windControl);

    document.getElementById('wind-strength')?.addEventListener('input', (e) => {
      this.windStrength = parseFloat(e.target.value);
      document.getElementById('wind-value').textContent = this.windStrength.toFixed(2);
    });

    // Depth control
    const depthControl = document.createElement('div');
    depthControl.className = 'control-slider';
    depthControl.innerHTML = `
      <label>Depth</label>
      <input type="range" id="max-depth" min="5" max="12" value="10" step="1">
      <span id="depth-value">10</span>
    `;
    controlsContainer.appendChild(depthControl);

    document.getElementById('max-depth')?.addEventListener('input', (e) => {
      this.maxDepth = parseInt(e.target.value);
      document.getElementById('depth-value').textContent = this.maxDepth;
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
    resetBtn.title = 'Reset to defaults';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
  }

  reset() {
    this.branchAngle = 25;
    this.windStrength = 0.3;
    this.maxDepth = 10;
    this.time = 0;

    // Reset sliders
    const angleSlider = document.getElementById('branch-angle');
    const windSlider = document.getElementById('wind-strength');
    const depthSlider = document.getElementById('max-depth');

    if (angleSlider) angleSlider.value = '25';
    if (windSlider) windSlider.value = '0.3';
    if (depthSlider) depthSlider.value = '10';

    if (document.getElementById('angle-value')) document.getElementById('angle-value').textContent = '25°';
    if (document.getElementById('wind-value')) document.getElementById('wind-value').textContent = '0.3';
    if (document.getElementById('depth-value')) document.getElementById('depth-value').textContent = '10';
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

  start() {
    this.isRunning = true;
    this.isPaused = false;
  }

  stop() {
    this.isRunning = false;
    this.isPaused = true;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
  }

  resize() {
    if (this.p5Instance && this.isRunning) {
      const rect = this.container.getBoundingClientRect();
      this.p5Instance.resizeCanvas(rect.width, rect.height);
    }
  }

  destroy() {
    this.stop();

    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
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
