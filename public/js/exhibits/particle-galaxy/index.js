// Particle Galaxy Exhibit
// 100,000 particles bound by simulated gravity forming a rotating galactic structure

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default class ParticleGalaxyExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.particles = null;
    this.particlesData = null;
    this.animationId = null;
    this.isRunning = false;

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;

    // Galaxy parameters
    this.particleCount = 100000;
    this.galaxyRadius = 100;
    this.gravityStrength = 0.5;
    this.rotationSpeed = 0.0001;
    this.time = 0;
  }

  async init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Camera setup
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
    this.camera.position.set(0, 60, 80);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(0, 0, 50);
    this.scene.add(pointLight);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = false;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;

    // Create particles
    this.createParticles();

    // Add event listeners
    window.addEventListener('resize', this.handleResize.bind(this));

    // Create FPS counter
    this.createFPSCounter();

    // Create controls UI
    this.createControls();
  }

  createParticles() {
    const geometry = new THREE.BufferGeometry();

    // Initialize particle data arrays
    this.particlesData = {
      positions: new Float32Array(this.particleCount * 3),
      velocities: new Float32Array(this.particleCount * 3),
      colors: new Float32Array(this.particleCount * 3),
      distances: new Float32Array(this.particleCount)
    };

    // Create spiral galaxy distribution
    for (let i = 0; i < this.particleCount; i++) {
      // Use logarithmic spiral for realistic galaxy
      const angle = Math.random() * Math.PI * 2;
      const spiralIndex = Math.random();

      // Logarithmic spiral arms
      const spiralRadius = this.galaxyRadius * 0.3 + spiralIndex * this.galaxyRadius * 0.7;
      const spiralAngle = angle + spiralIndex * Math.PI * 4; // Multiple spiral arms

      // Add some randomness to the spiral
      const noiseX = (Math.random() - 0.5) * 5;
      const noiseY = (Math.random() - 0.5) * 5;
      const noiseZ = (Math.random() - 0.5) * 3;

      const x = Math.cos(spiralAngle) * spiralRadius + noiseX;
      const y = (Math.random() - 0.5) * 15;
      const z = Math.sin(spiralAngle) * spiralRadius + noiseZ;

      this.particlesData.positions[i * 3] = x;
      this.particlesData.positions[i * 3 + 1] = y;
      this.particlesData.positions[i * 3 + 2] = z;

      // Calculate distance from center for orbital velocity
      const distFromCenter = Math.sqrt(x * x + z * z);
      this.particlesData.distances[i] = distFromCenter;

      // Tangential velocity for orbital motion
      const orbitalSpeed = Math.sqrt(this.gravityStrength / Math.max(distFromCenter, 1)) * 0.5;
      const velocityAngle = spiralAngle + Math.PI / 2; // Perpendicular to radius

      this.particlesData.velocities[i * 3] = Math.cos(velocityAngle) * orbitalSpeed;
      this.particlesData.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      this.particlesData.velocities[i * 3 + 2] = Math.sin(velocityAngle) * orbitalSpeed;

      // Color based on distance from center: blue -> white -> yellow
      const colorT = Math.min(distFromCenter / (this.galaxyRadius * 0.8), 1);
      const r = colorT > 0.5 ? 1 : colorT * 2;
      const g = colorT > 0.7 ? 1 : colorT * 1.4;
      const b = colorT < 0.5 ? 1 : 1 - (colorT - 0.5) * 2;

      this.particlesData.colors[i * 3] = r;
      this.particlesData.colors[i * 3 + 1] = g;
      this.particlesData.colors[i * 3 + 2] = b;
    }

    // Add to geometry
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlesData.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.particlesData.colors, 3));

    // Create material with vertex colors
    const material = new THREE.PointsMaterial({
      size: 0.5,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      fog: false
    });

    // Create points mesh
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  updateParticles() {
    const positions = this.particlesData.positions;
    const velocities = this.particlesData.velocities;
    const colors = this.particlesData.colors;

    // Update each particle
    for (let i = 0; i < this.particleCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      // Distance from center
      const distSq = px * px + py * py + pz * pz;
      const dist = Math.sqrt(distSq);

      // Gravity acceleration toward center (F = -k * r)
      const accelMagnitude = -this.gravityStrength / Math.max(distSq, 10);
      const ax = (px / dist) * accelMagnitude;
      const ay = (py / dist) * accelMagnitude;
      const az = (pz / dist) * accelMagnitude;

      // Update velocities
      velocities[i * 3] += ax;
      velocities[i * 3 + 1] += ay;
      velocities[i * 3 + 2] += az;

      // Add damping
      velocities[i * 3] *= 0.999;
      velocities[i * 3 + 1] *= 0.999;
      velocities[i * 3 + 2] *= 0.999;

      // Update positions
      positions[i * 3] += velocities[i * 3];
      positions[i * 3 + 1] += velocities[i * 3 + 1];
      positions[i * 3 + 2] += velocities[i * 3 + 2];

      // Keep particles from getting too far
      if (dist > this.galaxyRadius * 2) {
        const ratio = this.galaxyRadius / dist;
        positions[i * 3] *= ratio;
        positions[i * 3 + 1] *= ratio;
        positions[i * 3 + 2] *= ratio;
        velocities[i * 3] *= 0.9;
        velocities[i * 3 + 1] *= 0.9;
        velocities[i * 3 + 2] *= 0.9;
      }

      // Update color based on current distance
      const colorT = Math.min(dist / (this.galaxyRadius * 0.8), 1);
      const r = colorT > 0.5 ? 1 : colorT * 2;
      const g = colorT > 0.7 ? 1 : colorT * 1.4;
      const b = colorT < 0.5 ? 1 : 1 - (colorT - 0.5) * 2;

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    // Update geometry
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
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

    // Gravity strength control
    const gravitySlider = document.createElement('div');
    gravitySlider.className = 'control-slider';
    gravitySlider.innerHTML = `
      <label>Gravity Strength</label>
      <input type="range" id="gravity-slider" min="0.1" max="2" value="0.5" step="0.1">
    `;
    controlsContainer.appendChild(gravitySlider);

    document.getElementById('gravity-slider')?.addEventListener('input', (e) => {
      this.gravityStrength = parseFloat(e.target.value);
    });

    // Particle count control (display only)
    const particleInfo = document.createElement('div');
    particleInfo.className = 'control-info';
    particleInfo.innerHTML = `
      <label>Particles: ${(this.particleCount / 1000).toFixed(0)}K</label>
    `;
    controlsContainer.appendChild(particleInfo);

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
    resetBtn.title = 'Reset simulation (R)';
    resetBtn.addEventListener('click', () => this.reset());
    controlsContainer.appendChild(resetBtn);
  }

  reset() {
    // Reset camera position
    this.camera.position.set(0, 60, 80);
    this.camera.lookAt(0, 0, 0);
    this.controls.reset();

    // Reset gravity to default
    this.gravityStrength = 0.5;
    const gravitySlider = document.getElementById('gravity-slider');
    if (gravitySlider) gravitySlider.value = '0.5';

    // Recreate particles with fresh spiral
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    this.scene.remove(this.particles);
    this.createParticles();
  }

  animate() {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(() => this.animate());

    // Update particles
    this.updateParticles();

    // Rotate galaxy
    this.particles.rotation.y += this.rotationSpeed;
    this.time += 0.016;

    // Update controls
    this.controls.update();

    // Render
    this.renderer.render(this.scene, this.camera);

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

  handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  resize() {
    this.handleResize();
  }

  start() {
    this.isRunning = true;
    this.animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  togglePause() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  destroy() {
    this.stop();

    // Clean up Three.js resources
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.scene.remove(this.particles);
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.fpsElement) {
      this.fpsElement.remove();
    }

    // Clear controls
    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) {
      controlsContainer.innerHTML = '';
    }

    // Remove resize listener
    window.removeEventListener('resize', this.handleResize.bind(this));
  }
}
