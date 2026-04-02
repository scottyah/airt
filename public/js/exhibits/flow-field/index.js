// Flow Field with Perlin Noise
// Interactive particle system with invisible force field

export default class FlowFieldExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.p5Instance = null;
    this.isRunning = false;
    this.fpsElement = null;

    // Performance and animation
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;

    // Flow field parameters
    this.particles = [];
    this.particleCount = 12000;
    this.noiseScale = 0.008;
    this.speed = 2;
    this.trailAlpha = 15;
    this.particleSize = 1.5;

    // Mouse interaction
    this.mouseInfluenceRadius = 120;
    this.mouseInfluenceStrength = 0.8;
    this.mousePos = { x: 0, y: 0 };
  }

  async init() {
    // Use globally loaded p5.js
    if (!window.p5) {
      throw new Error('p5.js library not loaded. Please ensure p5.js is included in index.html');
    }
    const p5 = window.p5;

    const sketch = (p) => {
      // Canvas setup
      p.setup = () => {
        const rect = this.container.getBoundingClientRect();
        const canvas = p.createCanvas(rect.width, rect.height);
        canvas.parent(this.container);

        p.colorMode(p.HSB, 360, 100, 100, 255);
        p.background(10, 10, 10);

        this.initializeParticles(p);

        // Mouse tracking
        // NOTE: p.createCanvas returns a renderer object, the actual <canvas> element is .canvas
        canvas.canvas.addEventListener('mousemove', (e) => {
          this.mousePos.x = e.offsetX;
          this.mousePos.y = e.offsetY;
        });

        canvas.canvas.addEventListener('mouseleave', () => {
          this.mousePos.x = -1000;
          this.mousePos.y = -1000;
        });
      };

      // Main animation loop
      p.draw = () => {
        if (!this.isRunning) return;

        // Fade background with low alpha for trail effect
        p.background(10, 10, 10, this.trailAlpha);

        // Update and draw particles
        for (let particle of this.particles) {
          this.updateParticle(particle, p);
          this.drawParticle(particle, p);
        }

        // Update FPS
        this.updateFPS();
      };

      // Handle window resize
      p.windowResized = () => {
        if (!this.container.offsetParent) return; // Hidden

        const rect = this.container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          p.resizeCanvas(rect.width, rect.height);
        }
      };
    };

    // Create p5.js instance in instance mode
    this.p5Instance = new p5(sketch);

    // Create FPS counter
    this.createFPSCounter();

    // Create controls
    this.createControls();

    // Set up keyboard shortcuts
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  initializeParticles(p) {
    this.particles = [];

    for (let i = 0; i < this.particleCount; i++) {
      const particle = {
        x: p.random(p.width),
        y: p.random(p.height),
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        hue: p.random(360),
        trail: [],
        maxTrailLength: 3,
        age: 0
      };

      this.particles.push(particle);
    }
  }

  updateParticle(particle, p) {
    // Get Perlin noise value at particle location
    const noiseVal = p.noise(
      particle.x * this.noiseScale,
      particle.y * this.noiseScale,
      p.frameCount * 0.001
    );

    // Convert noise to angle (0 to 2*PI)
    const angle = noiseVal * Math.PI * 2;

    // Get acceleration from flow field
    particle.ax = Math.cos(angle) * this.speed;
    particle.ay = Math.sin(angle) * this.speed;

    // Mouse influence - repel from mouse
    const dx = particle.x - this.mousePos.x;
    const dy = particle.y - this.mousePos.y;
    const distToMouse = Math.sqrt(dx * dx + dy * dy);

    if (distToMouse < this.mouseInfluenceRadius && distToMouse > 0) {
      const influence = (1 - distToMouse / this.mouseInfluenceRadius) * this.mouseInfluenceStrength;
      const normalizedDx = dx / distToMouse;
      const normalizedDy = dy / distToMouse;

      particle.ax += normalizedDx * influence * this.speed;
      particle.ay += normalizedDy * influence * this.speed;
    }

    // Update velocity (with slight friction for smoother motion)
    particle.vx += particle.ax;
    particle.vy += particle.ay;

    // Apply friction
    particle.vx *= 0.95;
    particle.vy *= 0.95;

    // Update position
    particle.x += particle.vx;
    particle.y += particle.vy;

    // Wrap around edges
    if (particle.x < 0) particle.x += p.width;
    if (particle.x > p.width) particle.x -= p.width;
    if (particle.y < 0) particle.y += p.height;
    if (particle.y > p.height) particle.y -= p.height;

    // Store trail point (reduced for performance)
    const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);

    if (p.frameCount % 2 === 0) {
      particle.trail.push({
        x: particle.x,
        y: particle.y,
        speed: speed,
        hue: particle.hue
      });

      if (particle.trail.length > particle.maxTrailLength) {
        particle.trail.shift();
      }
    }

    // Update hue based on velocity angle for nice color effects
    const velocityAngle = Math.atan2(particle.vy, particle.vx);
    particle.hue = ((velocityAngle / Math.PI * 180 + 360) % 360);

    particle.age++;
  }

  drawParticle(particle, p) {
    // Draw trail with gradient
    if (particle.trail.length > 1) {
      p.strokeWeight(this.particleSize * 0.6);

      for (let i = 0; i < particle.trail.length - 1; i++) {
        const point1 = particle.trail[i];
        const point2 = particle.trail[i + 1];

        const alpha = (i / particle.trail.length) * 80;
        p.stroke(point1.hue, 80, 70, alpha);
        p.line(point1.x, point1.y, point2.x, point2.y);
      }
    }

    // Draw particle
    const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
    const saturation = Math.min(100, 40 + speed * 10);
    const brightness = Math.min(100, 60 + speed * 5);

    p.noStroke();
    p.fill(particle.hue, saturation, brightness, 200);
    p.ellipse(particle.x, particle.y, this.particleSize);
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

  createControls() {
    const controlsContainer = document.getElementById('exhibit-controls');
    if (!controlsContainer) return;

    controlsContainer.innerHTML = '';

    // Speed control
    const speedSlider = document.createElement('div');
    speedSlider.className = 'control-slider';
    speedSlider.innerHTML = `
      <label>Speed</label>
      <input type="range" id="speed-slider" min="0.5" max="4" value="2" step="0.1">
    `;
    controlsContainer.appendChild(speedSlider);

    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
      this.speed = parseFloat(e.target.value);
    });

    // Trail length control
    const trailSlider = document.createElement('div');
    trailSlider.className = 'control-slider';
    trailSlider.innerHTML = `
      <label>Trail</label>
      <input type="range" id="trail-slider" min="5" max="50" value="15" step="1">
    `;
    controlsContainer.appendChild(trailSlider);

    document.getElementById('trail-slider')?.addEventListener('input', (e) => {
      this.trailAlpha = parseInt(e.target.value);
    });

    // Mouse influence control
    const mouseSlider = document.createElement('div');
    mouseSlider.className = 'control-slider';
    mouseSlider.innerHTML = `
      <label>Mouse Effect</label>
      <input type="range" id="mouse-slider" min="0" max="2" value="0.8" step="0.1">
    `;
    controlsContainer.appendChild(mouseSlider);

    document.getElementById('mouse-slider')?.addEventListener('input', (e) => {
      this.mouseInfluenceStrength = parseFloat(e.target.value);
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
    resetBtn.title = 'Reset particle positions (R)';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
  }

  handleKeydown(e) {
    if (e.key.toUpperCase() === 'R') {
      this.reset();
    }
  }

  reset() {
    if (this.p5Instance) {
      this.initializeParticles(this.p5Instance);
      this.p5Instance.background(10, 10, 10);
    }
  }

  start() {
    this.isRunning = true;
    if (this.p5Instance) {
      this.p5Instance.background(10, 10, 10);
    }
  }

  stop() {
    this.isRunning = false;
  }

  resize() {
    if (this.p5Instance && this.container.offsetParent) {
      const rect = this.container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.p5Instance.resizeCanvas(rect.width, rect.height);
        this.p5Instance.background(10, 10, 10);
      }
    }
  }

  destroy() {
    this.stop();

    // Remove keyboard listener
    document.removeEventListener('keydown', this.handleKeydown.bind(this));

    // Remove p5.js instance
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }

    // Remove FPS counter
    if (this.fpsElement) {
      this.fpsElement.remove();
      this.fpsElement = null;
    }

    // Clear controls
    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) {
      controlsContainer.innerHTML = '';
    }

    this.particles = [];
  }
}
