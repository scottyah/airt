export default class ChromaticPulse {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.p5 = null;
    this.isPaused = false;
    this.walkers = [];
    this.palette = [];
  }

  async init() {
    if (!window.p5) {
      console.error('p5.js not loaded');
      return;
    }
    const p5 = window.p5;

    const sketch = (s) => {
      const numWalkers = 500;
      let time = 0;

      s.setup = () => {
        const { clientWidth, clientHeight } = this.container;
        s.createCanvas(clientWidth, clientHeight);
        s.colorMode(s.HSB, 360, 100, 100, 100);
        s.background(0, 0, 10);
        this.generatePalette(s);
        this.createWalkers(s, numWalkers);
      };

      s.draw = () => {
        time += 0.005;
        this.walkers.forEach(walker => {
          walker.update(s, time, s.mouseX, s.mouseY);
          walker.display(s);
        });
      };

      s.windowResized = () => {
        this.resize();
      };

      s.mousePressed = () => {
        this.generatePalette(s);
        this.walkers.forEach(walker => walker.setNewTargetColor(s, this.palette));
      };
    };

    this.p5 = new p5(sketch, this.container);
  }

  generatePalette(s) {
    const baseHue = s.random(360);
    this.palette = [
      s.color(baseHue, s.random(60, 80), s.random(80, 100)),
      s.color((baseHue + 40) % 360, s.random(60, 80), s.random(80, 100)),
      s.color((baseHue + 80) % 360, s.random(60, 80), s.random(80, 100)),
      s.color((baseHue + 180) % 360, s.random(70, 90), s.random(90, 100)),
    ];
  }

  createWalkers(s, numWalkers) {
      this.walkers = [];
      for (let i = 0; i < numWalkers; i++) {
        this.walkers.push(new Walker(s, this.palette));
      }
  }

  start() {
    if (this.p5) {
      this.isPaused = false;
      this.p5.loop();
    }
  }

  stop() {
    if (this.p5) {
      this.isPaused = true;
      this.p5.noLoop();
    }
  }

  resize() {
    if (this.p5) {
      const { clientWidth, clientHeight } = this.container;
      this.p5.resizeCanvas(clientWidth, clientHeight);
      this.p5.background(0, 0, 10);
    }
  }

  reset() {
    if (this.p5) {
        this.p5.background(0, 0, 10);
        this.generatePalette(this.p5);
        this.createWalkers(this.p5, 500);
    }
  }

  togglePause() {
    this.isPaused ? this.start() : this.stop();
  }

  destroy() {
    if (this.p5) {
      this.p5.remove();
      this.p5 = null;
    }
  }
}

class Walker {
  constructor(s, palette) {
    this.pos = s.createVector(s.random(s.width), s.random(s.height));
    this.noiseScale = 500;
    this.noiseStrength = 5;
    this.setNewTargetColor(s, palette);
    this.color = this.targetColor;
  }

  setNewTargetColor(s, palette) {
    this.targetColor = s.random(palette);
  }

  update(s, time, mouseX, mouseY) {
    const mouseInfluence = s.dist(this.pos.x, this.pos.y, mouseX, mouseY) / Math.min(s.width, s.height);
    const noiseFactor = s.map(mouseInfluence, 0, 1, 0.5, 2, true);

    const angle = s.noise(this.pos.x / this.noiseScale, this.pos.y / this.noiseScale, time * noiseFactor) * s.TWO_PI * this.noiseStrength;

    this.pos.x += s.cos(angle);
    this.pos.y += s.sin(angle);

    this.color = s.lerpColor(this.color, this.targetColor, 0.02);

    if (this.pos.x < 0) this.pos.x = s.width;
    if (this.pos.x > s.width) this.pos.x = 0;
    if (this.pos.y < 0) this.pos.y = s.height;
    if (this.pos.y > s.height) this.pos.y = 0;
  }

  display(s) {
    s.noStroke();
    s.fill(
        s.hue(this.color),
        s.saturation(this.color),
        s.brightness(this.color),
        s.random(20, 50)
    );
    s.circle(this.pos.x, this.pos.y, s.random(1, 4));
  }
}
