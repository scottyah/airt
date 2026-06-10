// Infinite Horizon Exhibit
// Endless flight over procedural dusk terrain — an homage to the flight
// simulator easter egg hidden in Excel 97. Terrain chunks are displaced by
// deterministic fractal value noise keyed on world coordinates, so the
// landscape is infinite, seamless across chunk borders, and never repeats.
// Chunks are pooled and recycled as the camera flies. Somewhere out in the
// hills stands a monolith with scrolling credits, as tradition demands.

const CHUNK = 240;            // world units per terrain tile
const SEGS = 36;              // grid segments per tile
const VIEW_RADIUS = 4;        // tiles kept around the look-ahead point
const BUILDS_PER_FRAME = 5;   // amortize generation so flight never hitches
const BASE_SPEED = 110;       // world units per second
const MONOLITH_PERIOD = 22;   // seconds between monolith sightings

// --- Deterministic fractal noise (seamless across chunks by construction) ---

function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smoothNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function terrainHeight(x, z) {
  // Broad swells + ridged mountains + fine detail
  const sx = x * 0.0011, sz = z * 0.0011;
  let h = smoothNoise(sx, sz) * 110;
  const r = smoothNoise(x * 0.0035 + 53.7, z * 0.0035 + 21.3);
  h += Math.pow(1 - Math.abs(r * 2 - 1), 2) * 95;          // ridges
  h += smoothNoise(x * 0.012 + 11.1, z * 0.012 + 7.9) * 18; // detail
  h += smoothNoise(x * 0.045 + 3.3, z * 0.045 + 9.1) * 5;
  return h - 80;
}

export default class InfiniteHorizonExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Flight state
    this.pos = { x: 0, y: 60, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speedFactor = 1.0;
    this.boost = 0;
    this.pointer = { x: 0, y: 0 }; // -1..1, steering input
    this.flightTime = 0;
    this.lastFrameTime = null;

    this.wireframe = false;

    // Terrain chunk pool
    this.chunks = new Map();   // "cx,cz" -> mesh
    this.freeChunks = [];

    this.monolith = null;
    this.nextMonolithAt = MONOLITH_PERIOD * 0.6;

    this.rect = { left: 0, top: 0, width: 1, height: 1 };

    // Performance tracking
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
  }

  async init() {
    if (typeof THREE === 'undefined') {
      const msg = document.createElement('div');
      msg.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;' +
        'justify-content:center;color:#c4a0d4;font-size:1.1rem;';
      msg.textContent = 'Three.js failed to load — please refresh.';
      this.container.appendChild(msg);
      return;
    }

    this.setupScene();
    this.setupSky();
    this.updateChunks(true);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.handlePointerMove);
    el.addEventListener('pointerdown', this.handlePointerDown);
    el.addEventListener('pointerup', this.handlePointerUp);
    el.addEventListener('pointerleave', this.handlePointerLeave);

    this.createFPSCounter();
    this.createControls();
  }

  setupScene() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.rect = this.container.getBoundingClientRect();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2b1a47, 0.0017);

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.5, 3000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Shared materials for all terrain chunks
    this.terrainMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7ad9,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
  }

  setupSky() {
    // Inverted gradient sphere that follows the camera (fog never touches it)
    const skyGeo = new THREE.SphereGeometry(2400, 24, 16);
    const colors = [];
    const posAttr = skyGeo.attributes.position;
    const top = new THREE.Color(0x0d0822);
    const mid = new THREE.Color(0x3d2058);
    const low = new THREE.Color(0xd4694f);
    const c = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const t = (posAttr.getY(i) / 2400 + 1) / 2; // 0 bottom .. 1 top
      if (t > 0.5) c.lerpColors(mid, top, (t - 0.5) * 2);
      else c.lerpColors(low, mid, t * 2);
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    // Low sun, always on the horizon ahead-left
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(130, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb36b, fog: false, depthWrite: false })
    );
    sun.position.set(-900, 60, -2100);
    sun.lookAt(0, 0, 0);
    this.sky.add(sun);

    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(320, 32),
      new THREE.MeshBasicMaterial({
        color: 0xc9573f, fog: false, depthWrite: false,
        transparent: true, opacity: 0.35
      })
    );
    halo.position.copy(sun.position).multiplyScalar(1.001);
    halo.lookAt(0, 0, 0);
    this.sky.add(halo);

    // Early stars in the upper sky
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 320; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42; // upper cap only
      const r = 2300;
      starPos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xfff6e0, size: 2.4, sizeAttenuation: false,
      fog: false, transparent: true, opacity: 0.7, depthWrite: false
    }));
    this.sky.add(stars);
  }

  // --- Terrain chunk management ---

  buildChunk(mesh, cx, cz) {
    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    const colAttr = geo.attributes.color;
    const originX = cx * CHUNK;
    const originZ = cz * CHUNK;

    const valley = new THREE.Color(0x241543);
    const slope = new THREE.Color(0x53276b);
    const ridge = new THREE.Color(0xa8488f);
    const peak = new THREE.Color(0xf4c9e0);
    const c = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const wx = originX + posAttr.getX(i);
      const wz = originZ + posAttr.getZ(i);
      const h = terrainHeight(wx, wz);
      posAttr.setY(i, h);

      // Color by elevation with slope-based shading (sun from -x)
      const hl = terrainHeight(wx - 6, wz);
      const shade = Math.max(0.45, Math.min(1.25, 1 + (hl - h) * 0.025));
      const t = Math.max(0, Math.min(1, (h + 80) / 200));
      if (t < 0.45) c.lerpColors(valley, slope, t / 0.45);
      else if (t < 0.8) c.lerpColors(slope, ridge, (t - 0.45) / 0.35);
      else c.lerpColors(ridge, peak, (t - 0.8) / 0.2);
      colAttr.setXYZ(i, c.r * shade, c.g * shade, c.b * shade);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeBoundingSphere();

    mesh.position.set(originX, 0, originZ);
    mesh.children[0].visible = this.wireframe;
  }

  makeChunkMesh() {
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color',
      new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const mesh = new THREE.Mesh(geo, this.terrainMaterial);
    const wire = new THREE.Mesh(geo, this.wireMaterial);
    wire.visible = this.wireframe;
    mesh.add(wire);
    return mesh;
  }

  updateChunks(force) {
    // Window of tiles around a point ahead of the camera's heading
    const aheadX = -Math.sin(this.yaw);
    const aheadZ = -Math.cos(this.yaw);
    const centerX = Math.round((this.pos.x + aheadX * CHUNK * 2) / CHUNK);
    const centerZ = Math.round((this.pos.z + aheadZ * CHUNK * 2) / CHUNK);

    if (!force && centerX === this.lastCenterX && centerZ === this.lastCenterZ) return;

    const needed = new Set();
    for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        needed.add(`${centerX + dx},${centerZ + dz}`);
      }
    }

    // Recycle chunks that fell out of the window
    for (const [key, mesh] of this.chunks) {
      if (!needed.has(key)) {
        this.chunks.delete(key);
        this.scene.remove(mesh);
        this.freeChunks.push(mesh);
      }
    }

    // Materialize missing chunks nearest-first, a few per frame so terrain
    // generation never causes a frame hitch mid-flight
    const missing = [];
    for (const key of needed) {
      if (!this.chunks.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        missing.push({ key, cx, cz, d: (cx - centerX) ** 2 + (cz - centerZ) ** 2 });
      }
    }
    missing.sort((a, b) => a.d - b.d);

    const budget = force ? Infinity : BUILDS_PER_FRAME;
    for (let i = 0; i < missing.length && i < budget; i++) {
      const { key, cx, cz } = missing[i];
      const mesh = this.freeChunks.pop() || this.makeChunkMesh();
      this.buildChunk(mesh, cx, cz);
      this.scene.add(mesh);
      this.chunks.set(key, mesh);
    }

    // Only mark the window settled once everything in it is built
    if (missing.length <= budget) {
      this.lastCenterX = centerX;
      this.lastCenterZ = centerZ;
    }
  }

  spawnMonolith() {
    if (this.monolith) {
      this.scene.remove(this.monolith);
      this.monolith.geometry.dispose();
      this.monolith.material.map?.dispose();
      this.monolith.material.dispose();
    }

    // Credits texture, scrolled slowly — the Excel 97 tradition
    const cnv = document.createElement('canvas');
    cnv.width = 128;
    cnv.height = 512;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, 128, 512);
    ctx.fillStyle = '#8be0ff';
    ctx.font = '700 13px monospace';
    ctx.textAlign = 'center';
    const lines = [
      'A I R T', '', 'art generated', 'and coded', 'by AI', '',
      'terrain born', 'from noise', 'never repeats', '',
      'for the pilots', 'of Excel 97', '', 'fly on'
    ];
    lines.forEach((line, i) => ctx.fillText(line, 64, 60 + i * 30));

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapT = THREE.RepeatWrapping;
    this.monolithTexture = tex;

    const ahead = 1100;
    const mx = this.pos.x - Math.sin(this.yaw) * ahead + (Math.random() - 0.5) * 500;
    const mz = this.pos.z - Math.cos(this.yaw) * ahead + (Math.random() - 0.5) * 500;
    const ground = terrainHeight(mx, mz);

    this.monolith = new THREE.Mesh(
      new THREE.BoxGeometry(16, 90, 4),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    this.monolith.position.set(mx, ground + 42, mz);
    this.monolith.rotation.y = this.yaw;
    this.scene.add(this.monolith);
  }

  // --- Interaction ---

  handlePointerMove(e) {
    this.pointer = {
      x: ((e.clientX - this.rect.left) / this.rect.width) * 2 - 1,
      y: ((e.clientY - this.rect.top) / this.rect.height) * 2 - 1
    };
  }

  handlePointerDown() {
    this.boosting = true;
  }

  handlePointerUp() {
    this.boosting = false;
  }

  handlePointerLeave() {
    this.pointer = { x: 0, y: 0 };
    this.boosting = false;
  }

  // --- Frame update ---

  update() {
    const now = performance.now();
    const dt = Math.min(0.05, this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 0.016);
    this.lastFrameTime = now;
    this.flightTime += dt;

    // Steering: pointer offset banks and pitches the craft
    const targetYawRate = -this.pointer.x * 0.9;
    const targetPitch = -this.pointer.y * 0.55;
    this.yaw += targetYawRate * dt;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3);
    this.roll += (-this.pointer.x * 0.5 - this.roll) * Math.min(1, dt * 3);

    // Speed with click-boost
    this.boost += ((this.boosting ? 1 : 0) - this.boost) * Math.min(1, dt * 2.5);
    const speed = BASE_SPEED * this.speedFactor * (1 + this.boost * 1.4);

    // Advance
    const cp = Math.cos(this.pitch);
    this.pos.x += -Math.sin(this.yaw) * cp * speed * dt;
    this.pos.z += -Math.cos(this.yaw) * cp * speed * dt;
    this.pos.y += Math.sin(this.pitch) * speed * dt;

    // Terrain avoidance: glide along a minimum altitude above the ground
    const ground = terrainHeight(this.pos.x, this.pos.z);
    const minAlt = ground + 14;
    if (this.pos.y < minAlt) this.pos.y += (minAlt - this.pos.y) * Math.min(1, dt * 6);
    const cruiseCeil = ground + 320;
    if (this.pos.y > cruiseCeil) this.pos.y += (cruiseCeil - this.pos.y) * Math.min(1, dt * 0.8);

    // Gentle bobbing makes the flight feel alive
    const bob = Math.sin(this.flightTime * 1.7) * 0.6;

    this.camera.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = this.roll;

    this.sky.position.copy(this.camera.position);

    this.updateChunks(false);

    // Monolith lifecycle
    if (this.flightTime > this.nextMonolithAt) {
      this.spawnMonolith();
      this.nextMonolithAt = this.flightTime + MONOLITH_PERIOD * (0.8 + Math.random() * 0.6);
    }
    if (this.monolithTexture) this.monolithTexture.offset.y -= dt * 0.04;
  }

  // --- Standard exhibit plumbing ---

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

    const speedSlider = document.createElement('div');
    speedSlider.className = 'control-slider';
    speedSlider.innerHTML = `
      <label>Speed</label>
      <input type="range" id="horizon-speed-slider" min="0.3" max="3" value="${this.speedFactor}" step="0.1">
      <span id="horizon-speed-value">${this.speedFactor.toFixed(1)}</span>
    `;
    controlsContainer.appendChild(speedSlider);

    document.getElementById('horizon-speed-slider')?.addEventListener('input', (e) => {
      this.speedFactor = parseFloat(e.target.value);
      document.getElementById('horizon-speed-value').textContent = this.speedFactor.toFixed(1);
    });

    const wireBtn = document.createElement('button');
    wireBtn.className = 'control-button';
    wireBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-6 9 6M3 15l9 6 9-6M3 9l9 6 9-6M3 9v6M21 9v6M12 3v6M12 15v6"/>
      </svg>
    `;
    wireBtn.title = 'Toggle wireframe (retro mode)';
    wireBtn.addEventListener('click', () => {
      this.wireframe = !this.wireframe;
      for (const mesh of this.chunks.values()) mesh.children[0].visible = this.wireframe;
      for (const mesh of this.freeChunks) mesh.children[0].visible = this.wireframe;
    });
    controlsContainer.appendChild(wireBtn);

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
    resetBtn.title = 'Return to start';
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
    if (!this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.rect = this.container.getBoundingClientRect();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  start() {
    if (!this.renderer) return;
    this.isRunning = true;
    this.lastFrameTime = null;
    this.animate();
  }

  animate() {
    if (!this.isRunning || this.isPaused) return;

    this.update();
    this.renderer.render(this.scene, this.camera);
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
      this.lastFrameTime = null;
      this.animate();
    }
  }

  reset() {
    this.pos = { x: 0, y: 60, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speedFactor = 1.0;
    this.boost = 0;
    this.flightTime = 0;
    this.nextMonolithAt = MONOLITH_PERIOD * 0.6;
    this.lastCenterX = undefined;
    this.updateChunks(true);

    const slider = document.getElementById('horizon-speed-slider');
    const value = document.getElementById('horizon-speed-value');
    if (slider) slider.value = '1';
    if (value) value.textContent = '1.0';
  }

  destroy() {
    this.stop();

    if (this.renderer) {
      const el = this.renderer.domElement;
      el.removeEventListener('pointermove', this.handlePointerMove);
      el.removeEventListener('pointerdown', this.handlePointerDown);
      el.removeEventListener('pointerup', this.handlePointerUp);
      el.removeEventListener('pointerleave', this.handlePointerLeave);

      for (const mesh of [...this.chunks.values(), ...this.freeChunks]) {
        mesh.geometry.dispose();
      }
      this.chunks.clear();
      this.freeChunks.length = 0;
      this.terrainMaterial.dispose();
      this.wireMaterial.dispose();
      if (this.monolith) {
        this.monolith.geometry.dispose();
        this.monolith.material.map?.dispose();
        this.monolith.material.dispose();
      }
      this.sky.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });

      this.renderer.dispose();
      el.remove();
      this.renderer = null;
    }
    if (this.fpsElement) this.fpsElement.remove();

    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) controlsContainer.innerHTML = '';
  }
}
