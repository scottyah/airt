// Voronoi Cellular Patterns
// Organic cellular structures with animated seed points

export default class VoronoiExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.p5Instance = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Voronoi parameters
    this.seedPoints = [];
    this.seedCount = 40;
    this.showBoundaries = true;
    this.animationSpeed = 1;
    this.colorMode = 'rainbow'; // 'rainbow', 'monochrome', 'thermal'

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
  }

  async init() {
    // Dynamically load p5.js if needed
    if (typeof p5 === 'undefined') {
      await this.loadP5();
    }

    // Create p5 sketch
    this.createSketch();

    // Create controls
    this.createControls();

    // Create FPS counter
    this.createFPSCounter();
  }

  loadP5() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  createSketch() {
    const self = this;

    const sketch = (p) => {
      p.setup = function() {
        const rect = self.container.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        const canvas = p.createCanvas(width, height);
        canvas.parent(self.container);

        // Initialize seed points
        self.initializeSeedPoints(p);

        p.colorMode(p.HSB, 360, 100, 100);
        p.noStroke();
      };

      p.draw = function() {
        if (!self.isRunning || self.isPaused) {
          return;
        }

        p.background(10, 5, 12);

        // Update seed point positions
        self.updateSeedPoints(p);

        // Draw Voronoi diagram
        self.drawVoronoiDiagram(p);

        // Draw seed points
        self.drawSeedPoints(p);

        // Update FPS
        self.updateFPS();
      };

      p.mousePressed = function() {
        if (self.isMouseInCanvas(p)) {
          self.addSeedPoint(p, p.mouseX, p.mouseY);
          return false;
        }
      };

      p.windowResized = function() {
        if (self.isRunning) {
          self.resize();
        }
      };
    };

    this.p5Instance = new p5(sketch);
  }

  initializeSeedPoints(p) {
    this.seedPoints = [];
    for (let i = 0; i < this.seedCount; i++) {
      this.seedPoints.push({
        x: p.random(p.width),
        y: p.random(p.height),
        vx: p.random(-0.5, 0.5),
        vy: p.random(-0.5, 0.5),
        hue: (i / this.seedCount) * 360,
        noiseOffsetX: p.random(1000),
        noiseOffsetY: p.random(1000),
        age: i * 2 // Stagger creation for visual effect
      });
    }
  }

  updateSeedPoints(p) {
    const time = p.frameCount * 0.01 * this.animationSpeed;

    for (let i = 0; i < this.seedPoints.length; i++) {
      const seed = this.seedPoints[i];

      // Use Perlin noise for smooth organic movement
      const noiseX = p.noise(seed.noiseOffsetX + time);
      const noiseY = p.noise(seed.noiseOffsetY + time);

      // Convert noise to velocity
      seed.vx = (noiseX - 0.5) * 3;
      seed.vy = (noiseY - 0.5) * 3;

      // Update position
      seed.x += seed.vx;
      seed.y += seed.vy;

      // Wrap around edges for seamless animation
      if (seed.x < -50) seed.x = p.width + 50;
      if (seed.x > p.width + 50) seed.x = -50;
      if (seed.y < -50) seed.y = p.height + 50;
      if (seed.y > p.height + 50) seed.y = -50;

      // Shift hue over time
      seed.hue = (seed.hue + 0.05) % 360;
      seed.age += 1;
    }
  }

  drawVoronoiDiagram(p) {
    const pixelSize = 4; // Render every Nth pixel for performance
    const pixels = p.createImage(p.width / pixelSize, p.height / pixelSize);
    pixels.loadPixels();

    for (let py = 0; py < p.height; py += pixelSize) {
      for (let px = 0; px < p.width; px += pixelSize) {
        // Find closest seed point
        let closestDist = Infinity;
        let closestIndex = 0;

        for (let i = 0; i < this.seedPoints.length; i++) {
          const seed = this.seedPoints[i];
          const dx = seed.x - px;
          const dy = seed.y - py;
          const dist = dx * dx + dy * dy;

          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = i;
          }
        }

        // Get color for this cell
        const seed = this.seedPoints[closestIndex];
        const color = this.getColorForSeed(seed, closestDist, p);

        // Set pixel color
        const imgX = px / pixelSize;
        const imgY = py / pixelSize;
        const idx = (imgY * pixels.width + imgX) * 4;
        pixels.pixels[idx] = color[0];
        pixels.pixels[idx + 1] = color[1];
        pixels.pixels[idx + 2] = color[2];
        pixels.pixels[idx + 3] = 255;
      }
    }

    pixels.updatePixels();

    // Draw the image scaled up
    p.image(pixels, 0, 0, p.width, p.height);

    // Draw cell boundaries
    if (this.showBoundaries) {
      this.drawBoundaries(p);
    }
  }

  getColorForSeed(seed, distance, p) {
    const hue = seed.hue;
    const saturation = 75 + Math.sin(seed.age * 0.05) * 15;
    const brightness = 60 + Math.sin(distance * 0.002) * 20;

    // Convert HSB to RGB
    const h = hue / 360;
    const s = saturation / 100;
    const b = brightness / 100;

    const c = b * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = b - c;

    let r, g, bl;
    if (h < 1/6) {
      r = c; g = x; bl = 0;
    } else if (h < 2/6) {
      r = x; g = c; bl = 0;
    } else if (h < 3/6) {
      r = 0; g = c; bl = x;
    } else if (h < 4/6) {
      r = 0; g = x; bl = c;
    } else if (h < 5/6) {
      r = x; g = 0; bl = c;
    } else {
      r = c; g = 0; bl = x;
    }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((bl + m) * 255)
    ];
  }

  drawBoundaries(p) {
    p.stroke(200, 10, 30);
    p.strokeWeight(0.5);
    p.noFill();

    // Draw subtle lines between seed points
    for (let i = 0; i < this.seedPoints.length; i++) {
      const seed1 = this.seedPoints[i];

      // Draw edges to nearby seeds
      for (let j = i + 1; j < Math.min(i + 4, this.seedPoints.length); j++) {
        const seed2 = this.seedPoints[j];
        const dx = seed2.x - seed1.x;
        const dy = seed2.y - seed1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 300) {
          const midX = (seed1.x + seed2.x) / 2;
          const midY = (seed1.y + seed2.y) / 2;
          p.point(midX, midY);
        }
      }
    }

    p.noStroke();
  }

  drawSeedPoints(p) {
    p.fill(360, 0, 100); // White
    p.stroke(200, 15, 40);
    p.strokeWeight(2);

    for (let i = 0; i < this.seedPoints.length; i++) {
      const seed = this.seedPoints[i];
      p.circle(seed.x, seed.y, 8);
    }

    p.noStroke();
  }

  addSeedPoint(p, x, y) {
    if (this.seedPoints.length < 100) {
      this.seedPoints.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        hue: p.random(360),
        noiseOffsetX: p.random(1000),
        noiseOffsetY: p.random(1000),
        age: 0
      });
    }
  }

  isMouseInCanvas(p) {
    return p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height;
  }

  createControls() {
    const controlsContainer = document.getElementById('exhibit-controls');
    if (!controlsContainer) return;

    controlsContainer.innerHTML = '';

    // Animation speed control
    const speedSlider = document.createElement('div');
    speedSlider.className = 'control-slider';
    speedSlider.innerHTML = `
      <label>Animation Speed</label>
      <input type="range" id="speed-slider" min="0.1" max="3" value="1" step="0.1">
    `;
    controlsContainer.appendChild(speedSlider);

    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
      this.animationSpeed = parseFloat(e.target.value);
    });

    // Cell count control
    const cellSlider = document.createElement('div');
    cellSlider.className = 'control-slider';
    cellSlider.innerHTML = `
      <label>Cell Count (${this.seedCount})</label>
      <input type="range" id="cell-slider" min="10" max="100" value="${this.seedCount}" step="5">
    `;
    controlsContainer.appendChild(cellSlider);

    document.getElementById('cell-slider')?.addEventListener('input', (e) => {
      const newCount = parseInt(e.target.value);
      if (newCount !== this.seedCount) {
        this.seedCount = newCount;
        // Adjust seed points
        if (this.seedPoints.length < newCount) {
          while (this.seedPoints.length < newCount) {
            const p = this.p5Instance;
            this.seedPoints.push({
              x: p.random(p.width),
              y: p.random(p.height),
              vx: p.random(-0.5, 0.5),
              vy: p.random(-0.5, 0.5),
              hue: (this.seedPoints.length / newCount) * 360,
              noiseOffsetX: p.random(1000),
              noiseOffsetY: p.random(1000),
              age: 0
            });
          }
        } else if (this.seedPoints.length > newCount) {
          this.seedPoints = this.seedPoints.slice(0, newCount);
        }
        e.target.previousElementSibling.textContent = `Cell Count (${newCount})`;
      }
    });

    // Boundaries toggle
    const boundariesBtn = document.createElement('button');
    boundariesBtn.className = 'control-button';
    boundariesBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v20M2 12h20M6 6l12 12M18 6L6 18"/>
      </svg>
    `;
    boundariesBtn.title = 'Toggle cell boundaries';
    boundariesBtn.addEventListener('click', () => {
      this.showBoundaries = !this.showBoundaries;
      boundariesBtn.classList.toggle('active', this.showBoundaries);
    });
    boundariesBtn.classList.add('active');
    controlsContainer.appendChild(boundariesBtn);

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
    resetBtn.title = 'Reset exhibit';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
  }

  createFPSCounter() {
    this.fpsElement = document.createElement('div');
    this.fpsElement.className = 'fps-counter good';
    this.fpsElement.textContent = '60 FPS';
    this.container.appendChild(this.fpsElement);
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

  reset() {
    if (this.p5Instance) {
      this.initializeSeedPoints(this.p5Instance);
      this.animationSpeed = 1;

      const speedSlider = document.getElementById('speed-slider');
      if (speedSlider) speedSlider.value = '1';
    }
  }

  resize() {
    if (this.p5Instance) {
      const rect = this.container.getBoundingClientRect();
      this.p5Instance.resizeCanvas(rect.width, rect.height);
    }
  }

  start() {
    this.isRunning = true;
    if (this.p5Instance) {
      this.p5Instance.loop();
    }
  }

  stop() {
    this.isRunning = false;
    this.isPaused = true;
    if (this.p5Instance) {
      this.p5Instance.noLoop();
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
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
