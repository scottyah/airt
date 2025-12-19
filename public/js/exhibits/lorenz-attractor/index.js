// Lorenz Attractor - Chaos Theory Visualization
// Interactive 3D visualization of the iconic butterfly strange attractor

export default class LorenzAttractorExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Lorenz parameters
    this.sigma = 10;
    this.rho = 28;
    this.beta = 8 / 3;
    this.dt = 0.01;

    // Particle system
    this.particles = [];
    this.maxTrailPoints = 5000;
    this.particleCount = 3;

    // Animation
    this.sceneRotation = true;
    this.rotationSpeed = 0.0002;

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
  }

  async init() {
    // Set up Three.js scene
    this.setupScene();

    // Create particles
    this.createParticles();

    // Add event listeners
    this.setupEventListeners();

    // Create controls UI
    this.createControls();

    // Create FPS counter
    this.createFPSCounter();

    // Start animation loop
    this.animate();
  }

  setupScene() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e27);
    this.scene.fog = new THREE.Fog(0x0a0e27, 200, 500);

    // Camera setup
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(40, 40, 40);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLighting();

    // Add grid and axes for reference
    this.addReferenceGeometry();

    // OrbitControls setup
    this.setupOrbitControls();
  }

  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);

    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.far = 200;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);

    // Accent lights for glow effect
    const pointLight1 = new THREE.PointLight(0xff00ff, 0.3, 200);
    pointLight1.position.set(-50, 50, 50);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x00ffff, 0.3, 200);
    pointLight2.position.set(50, -50, 50);
    this.scene.add(pointLight2);
  }

  addReferenceGeometry() {
    // Add a subtle grid
    const gridHelper = new THREE.GridHelper(100, 20, 0x404060, 0x202040);
    gridHelper.position.y = -50;
    this.scene.add(gridHelper);

    // Add axes (for debugging/reference)
    const axesHelper = new THREE.AxesHelper(30);
    this.scene.add(axesHelper);
  }

  setupOrbitControls() {
    // Simple orbit controls implementation
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.enableZoom = true;
      this.controls.autoRotate = false;
      this.controls.autoRotateSpeed = 0;
    } else {
      // Fallback manual controls
      this.setupManualControls();
    }
  }

  setupManualControls() {
    // Implement basic manual camera controls if OrbitControls is not available
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.renderer.domElement.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      const theta = Math.atan2(this.camera.position.z, this.camera.position.x);
      const phi = Math.acos(this.camera.position.y / this.camera.getWorldPosition(new THREE.Vector3()).length());

      const radius = this.camera.getWorldPosition(new THREE.Vector3()).length();
      const newTheta = theta - deltaX * 0.01;
      const newPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + deltaY * 0.01));

      this.camera.position.x = radius * Math.sin(newPhi) * Math.cos(newTheta);
      this.camera.position.y = radius * Math.cos(newPhi);
      this.camera.position.z = radius * Math.sin(newPhi) * Math.sin(newTheta);
      this.camera.lookAt(0, 0, 0);

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.renderer.domElement.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Zoom with scroll
    this.renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      const currentDist = this.camera.getWorldPosition(new THREE.Vector3()).length();
      const direction = this.camera.getWorldPosition(new THREE.Vector3()).normalize();
      const newDist = Math.max(20, Math.min(150, currentDist + e.deltaY * 0.05));
      this.camera.position.copy(direction.multiplyScalar(newDist));
      this.camera.lookAt(0, 0, 0);
    });
  }

  createParticles() {
    // Create multiple particles with slight parameter variations
    const variationFactors = [
      { sigma: 1.0, rho: 1.0, beta: 1.0, hueOffset: 0 },
      { sigma: 1.02, rho: 1.01, beta: 0.99, hueOffset: 120 },
      { sigma: 0.98, rho: 0.99, beta: 1.01, hueOffset: 240 },
    ];

    variationFactors.forEach((factor, index) => {
      const particle = {
        x: 0.1,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        trail: [],
        mesh: null,
        geometry: null,
        material: null,
        sigma: this.sigma * factor.sigma,
        rho: this.rho * factor.rho,
        beta: this.beta * factor.beta,
        hueOffset: factor.hueOffset,
        time: 0,
      };

      this.particles.push(particle);
    });

    // Create geometries and materials for each particle
    this.particles.forEach((particle) => {
      // Trail geometry
      particle.geometry = new THREE.BufferGeometry();
      particle.positions = [];
      particle.colors = [];

      // Material with glow
      particle.material = new THREE.LineBasicMaterial({
        linewidth: 2,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
      });

      // Create line mesh
      particle.mesh = new THREE.Line(particle.geometry, particle.material);
      this.scene.add(particle.mesh);

      // Particle point (current position)
      const pointGeometry = new THREE.SphereGeometry(0.5, 8, 8);
      const pointMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL((particle.hueOffset % 360) / 360, 1, 0.5),
        emissive: new THREE.Color().setHSL((particle.hueOffset % 360) / 360, 1, 0.4),
        metalness: 0.3,
        roughness: 0.4,
      });
      const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
      this.scene.add(pointMesh);
      particle.pointMesh = pointMesh;
    });
  }

  // Lorenz equations
  lorenzDerivatives(x, y, z, sigma, rho, beta) {
    const dx = sigma * (y - x);
    const dy = x * (rho - z) - y;
    const dz = x * y - beta * z;
    return { dx, dy, dz };
  }

  // Runge-Kutta 4th order integration
  stepRK4(particle) {
    const { x, y, z } = particle;
    const { sigma, rho, beta, dt } = particle;

    // k1
    const k1 = this.lorenzDerivatives(x, y, z, sigma, rho, beta);
    const k1x = k1.dx * dt;
    const k1y = k1.dy * dt;
    const k1z = k1.dz * dt;

    // k2
    const k2 = this.lorenzDerivatives(x + k1x * 0.5, y + k1y * 0.5, z + k1z * 0.5, sigma, rho, beta);
    const k2x = k2.dx * dt;
    const k2y = k2.dy * dt;
    const k2z = k2.dz * dt;

    // k3
    const k3 = this.lorenzDerivatives(x + k2x * 0.5, y + k2y * 0.5, z + k2z * 0.5, sigma, rho, beta);
    const k3x = k3.dx * dt;
    const k3y = k3.dy * dt;
    const k3z = k3.dz * dt;

    // k4
    const k4 = this.lorenzDerivatives(x + k3x, y + k3y, z + k3z, sigma, rho, beta);
    const k4x = k4.dx * dt;
    const k4y = k4.dy * dt;
    const k4z = k4.dz * dt;

    // Update position
    particle.x += (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
    particle.y += (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
    particle.z += (k1z + 2 * k2z + 2 * k3z + k4z) / 6;
  }

  updateParticles() {
    this.particles.forEach((particle) => {
      // Step the Lorenz equations
      for (let i = 0; i < 3; i++) {
        this.stepRK4(particle);
      }

      // Add point to trail
      particle.trail.push({
        x: particle.x,
        y: particle.y,
        z: particle.z,
        time: particle.time,
      });

      // Limit trail length
      if (particle.trail.length > this.maxTrailPoints) {
        particle.trail.shift();
      }

      particle.time += this.dt;

      // Update point mesh position
      if (particle.pointMesh) {
        particle.pointMesh.position.set(particle.x, particle.y, particle.z);
      }
    });
  }

  updateTrailGeometries() {
    this.particles.forEach((particle) => {
      // Update positions
      particle.positions = [];
      particle.colors = [];

      particle.trail.forEach((point, index) => {
        particle.positions.push(point.x, point.y, point.z);

        // Color based on position along trail - gradient effect
        const t = index / particle.trail.length;
        const hue = ((particle.hueOffset + t * 60) % 360) / 360;
        const saturation = 1;
        const lightness = 0.5 + t * 0.3;

        const color = new THREE.Color();
        color.setHSL(hue, saturation, lightness);

        particle.colors.push(color.r, color.g, color.b);
      });

      // Update geometry
      if (particle.positions.length > 0) {
        particle.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particle.positions), 3));
        particle.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(particle.colors), 3));
      }
    });
  }

  createControls() {
    const controlsContainer = document.getElementById('exhibit-controls');
    if (!controlsContainer) return;

    controlsContainer.innerHTML = '';

    // Scene rotation toggle
    const rotationToggle = document.createElement('div');
    rotationToggle.className = 'control-toggle';
    rotationToggle.innerHTML = `
      <label>
        <input type="checkbox" id="rotation-toggle" ${this.sceneRotation ? 'checked' : ''}>
        Auto Rotate
      </label>
    `;
    controlsContainer.appendChild(rotationToggle);

    document.getElementById('rotation-toggle')?.addEventListener('change', (e) => {
      this.sceneRotation = e.target.checked;
    });

    // Speed control
    const speedSlider = document.createElement('div');
    speedSlider.className = 'control-slider';
    speedSlider.innerHTML = `
      <label>Speed</label>
      <input type="range" id="speed-slider" min="0.001" max="0.1" value="0.01" step="0.001">
    `;
    controlsContainer.appendChild(speedSlider);

    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
      this.dt = parseFloat(e.target.value);
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

  createFPSCounter() {
    this.fpsElement = document.createElement('div');
    this.fpsElement.className = 'fps-counter good';
    this.fpsElement.textContent = '60 FPS';
    this.container.appendChild(this.fpsElement);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        this.reset();
      }
    });
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    if (!this.isRunning || this.isPaused) return;

    // Auto-rotate scene
    if (this.sceneRotation) {
      this.scene.rotation.y += this.rotationSpeed;
    }

    // Update controls
    if (this.controls && this.controls.update) {
      this.controls.update();
    }

    // Update particles
    this.updateParticles();
    this.updateTrailGeometries();

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

  reset() {
    // Reset camera
    this.camera.position.set(40, 40, 40);
    this.camera.lookAt(0, 0, 0);

    // Reset particles
    this.particles.forEach((particle) => {
      particle.x = 0.1;
      particle.y = 0;
      particle.z = 0;
      particle.trail = [];
      particle.time = 0;
    });

    // Reset controls
    const rotationToggle = document.getElementById('rotation-toggle');
    if (rotationToggle) rotationToggle.checked = this.sceneRotation;
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    if (this.isRunning) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  start() {
    this.isRunning = true;
    this.animate();
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
  }

  destroy() {
    this.stop();

    // Remove renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }

    // Remove geometries and materials
    this.particles.forEach((particle) => {
      if (particle.geometry) particle.geometry.dispose();
      if (particle.material) particle.material.dispose();
      if (particle.mesh) particle.mesh.remove();
      if (particle.pointMesh) particle.pointMesh.remove();
    });

    // Clear scene
    if (this.scene) {
      this.scene.clear();
    }

    // Remove FPS element
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
