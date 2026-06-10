// Starling Vortex Exhibit
// A 3D murmuration rendered with raw WebGL2: the CPU simulates boids in three
// dimensions over a 3D spatial hash grid, the GPU draws each bird as an
// instanced, velocity-oriented streak whose iridescent color is computed in
// the vertex shader from its angle to the camera — like real starling
// plumage. A breathing vortex force periodically winds the flock into a
// towering spiral. The cursor is unprojected into world space as a falcon.

const MAX_BIRDS = 4000;
const PERCEPTION = 60;
const SEP_RADIUS = 24;
const MAX_NEIGHBORS = 20;
const WORLD_RADIUS = 380;     // soft containment sphere
const GRID_EXTENT = 480;      // grid half-extent (> WORLD_RADIUS for strays)
const FALCON_RADIUS = 170;
const CAM_DIST = 950;
const CAM_FOV = (60 * Math.PI) / 180;

const VERTEX_SHADER = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_pos;
layout(location=2) in vec3 a_vel;
layout(location=3) in float a_seed;
uniform mat4 u_vp;
uniform vec3 u_eye;
uniform float u_aspect;
uniform float u_time;
uniform float u_shimmer;
out vec3 v_color;
out vec2 v_uv;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  vec4 head = u_vp * vec4(a_pos, 1.0);
  vec4 tail = u_vp * vec4(a_pos - a_vel * 2.8, 1.0);
  vec2 hn = head.xy / head.w;
  vec2 tn = tail.xy / tail.w;

  // Orient the streak along the projected velocity (aspect-corrected)
  vec2 dir = (hn - tn) * vec2(u_aspect, 1.0);
  float len = max(length(dir), 1e-5);
  dir /= len;
  vec2 perp = vec2(-dir.y, dir.x);

  float scale = 1.0 / head.w; // perspective: near birds are larger
  float halfLen = clamp(34.0 * scale, 0.004, 0.06);
  float halfWid = clamp(6.5 * scale, 0.0012, 0.014);
  vec2 off = dir * a_corner.x * halfLen + perp * a_corner.y * halfWid;
  off.x /= u_aspect;

  gl_Position = vec4((hn + off) * head.w, head.z, head.w);

  // Iridescence: hue depends on the bird's heading relative to the eye ray,
  // sweeping green (0.36) to violet (0.78) like structural feather color
  vec3 viewDir = normalize(a_pos - u_eye);
  vec3 heading = normalize(a_vel + vec3(1e-4));
  float facing = 0.5 + 0.5 * dot(heading, viewDir);
  float speed = length(a_vel);
  float hue = 0.36 + 0.42 * facing
            + 0.06 * sin(a_seed * 6.2831 + u_time * 0.9) * u_shimmer;
  float val = 0.45 + 0.55 * clamp(speed * 0.22, 0.0, 1.0);
  v_color = hsv2rgb(vec3(hue, 0.8, val));
  v_uv = a_corner;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec3 v_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
  // Soft-edged streak: bright spine fading to feathered edges
  float a = (1.0 - abs(v_uv.x)) * pow(1.0 - abs(v_uv.y), 2.0);
  outColor = vec4(v_color * a, a);
}`;

export default class StarlingVortexExhibit {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.bgCanvas = null;
    this.glCanvas = null;
    this.gl = null;
    this.program = null;
    this.buffers = {};
    this.uniforms = {};
    this.animationId = null;
    this.isRunning = false;
    this.isPaused = false;

    // Tunable parameters
    this.flockSize = 2000;
    this.vortexStrength = 1.0;
    this.shimmer = 1.0;

    // Bird state in 3D (struct-of-arrays)
    this.px = new Float32Array(MAX_BIRDS);
    this.py = new Float32Array(MAX_BIRDS);
    this.pz = new Float32Array(MAX_BIRDS);
    this.vx = new Float32Array(MAX_BIRDS);
    this.vy = new Float32Array(MAX_BIRDS);
    this.vz = new Float32Array(MAX_BIRDS);
    this.count = 0;

    // Interleaved GPU upload buffers
    this.posBuffer = new Float32Array(MAX_BIRDS * 3);
    this.velBuffer = new Float32Array(MAX_BIRDS * 3);

    // 3D spatial hash grid (counting sort)
    this.gridDim = Math.ceil((GRID_EXTENT * 2) / PERCEPTION);
    this.cellOf = new Int32Array(MAX_BIRDS);
    this.cellStart = new Int32Array(this.gridDim ** 3 + 1);
    this.cellCursor = new Int32Array(this.gridDim ** 3);
    this.gridIndices = new Int32Array(MAX_BIRDS);

    // Camera and interaction
    this.camYaw = 0;
    this.camPitch = 0.12;
    this.falcon = null; // {x,y,z} world-space, or null
    this.pointer = null; // raw NDC coords
    this.time = 0;

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
    // Background canvas: pre-rendered twilight nebula behind the GL layer
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.style.cssText = 'position:absolute;top:0;left:0;';
    this.container.appendChild(this.bgCanvas);

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.style.cssText = 'position:absolute;top:0;left:0;';
    this.container.appendChild(this.glCanvas);

    this.gl = this.glCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true
    });

    if (!this.gl) {
      this.showFallbackMessage();
      return;
    }

    this.setupGL();
    this.resize();
    this.spawnBirds(this.flockSize);

    this.glCanvas.addEventListener('pointermove', this.handlePointerMove);
    this.glCanvas.addEventListener('pointerdown', this.handlePointerDown);
    this.glCanvas.addEventListener('pointerleave', this.handlePointerLeave);

    this.createFPSCounter();
    this.createControls();
  }

  showFallbackMessage() {
    const msg = document.createElement('div');
    msg.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;color:#9b8cc4;font-size:1.1rem;text-align:center;padding:2rem;';
    msg.textContent = 'This exhibit requires WebGL2, which your browser does not support.';
    this.container.appendChild(msg);
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile failed: ' + log);
    }
    return shader;
  }

  setupGL() {
    const gl = this.gl;

    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(this.program));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.uniforms.vp = gl.getUniformLocation(this.program, 'u_vp');
    this.uniforms.eye = gl.getUniformLocation(this.program, 'u_eye');
    this.uniforms.aspect = gl.getUniformLocation(this.program, 'u_aspect');
    this.uniforms.time = gl.getUniformLocation(this.program, 'u_time');
    this.uniforms.shimmer = gl.getUniformLocation(this.program, 'u_shimmer');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Quad corners (per-vertex, shared by all instances)
    this.buffers.corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.corner);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Per-instance position (streamed every frame)
    this.buffers.pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pos);
    gl.bufferData(gl.ARRAY_BUFFER, this.posBuffer.byteLength, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    // Per-instance velocity (streamed every frame)
    this.buffers.vel = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vel);
    gl.bufferData(gl.ARRAY_BUFFER, this.velBuffer.byteLength, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // Per-instance seed (static)
    const seeds = new Float32Array(MAX_BIRDS);
    for (let i = 0; i < MAX_BIRDS; i++) seeds[i] = Math.random();
    this.buffers.seed = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.seed);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    // Additive blending: overlapping birds glow, order-independent
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
  }

  spawnBirds(target) {
    while (this.count < target) {
      const i = this.count++;
      // Spawn in a loose shell so the vortex forms visibly
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = WORLD_RADIUS * (0.3 + Math.random() * 0.6);
      this.px[i] = r * Math.sin(phi) * Math.cos(theta);
      this.py[i] = r * Math.cos(phi) * 0.6;
      this.pz[i] = r * Math.sin(phi) * Math.sin(theta);
      const a = Math.random() * Math.PI * 2;
      this.vx[i] = Math.cos(a) * 2;
      this.vy[i] = (Math.random() - 0.5) * 1.5;
      this.vz[i] = Math.sin(a) * 2;
    }
    this.count = target;
  }

  // --- Camera math (column-major mat4, matching GLSL) ---

  computeCamera() {
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    const eye = [CAM_DIST * sy * cp, CAM_DIST * sp, CAM_DIST * cy * cp];

    // Basis: forward toward origin, right, up
    let fx = -eye[0], fy = -eye[1], fz = -eye[2];
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl; fy /= fl; fz /= fl;
    // right = forward x worldUp
    let rx = fz, ry = 0, rz = -fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; rz /= rl;
    // up = right x forward
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    const aspect = this.rect.width / this.rect.height;
    const f = 1 / Math.tan(CAM_FOV / 2);
    const near = 1, far = 4000;
    const nf = 1 / (near - far);

    // view matrix (lookAt), column-major
    const tx = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
    const ty = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
    const tz = fx * eye[0] + fy * eye[1] + fz * eye[2];
    const view = [
      rx, ux, -fx, 0,
      ry, uy, -fy, 0,
      rz, uz, -fz, 0,
      tx, ty, tz, 1
    ];
    const proj = [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ];

    // vp = proj * view
    const vp = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += proj[k * 4 + r] * view[c * 4 + k];
        vp[c * 4 + r] = s;
      }
    }

    this.eye = eye;
    this.camBasis = { fx, fy, fz, rx, ry, rz, ux, uy, uz, f, aspect };
    return vp;
  }

  updateFalcon() {
    if (!this.pointer || !this.camBasis) {
      this.falcon = null;
      return;
    }
    // Unproject the cursor: ray from the eye through the pointer, evaluated
    // at the flock's depth (distance from camera to world center)
    const { fx, fy, fz, rx, ry, rz, ux, uy, uz, f, aspect } = this.camBasis;
    const tanHalf = 1 / f;
    const dx = fx + this.pointer.x * tanHalf * aspect * rx + this.pointer.y * tanHalf * ux;
    const dy = fy + this.pointer.x * tanHalf * aspect * ry + this.pointer.y * tanHalf * uy;
    const dz = fz + this.pointer.x * tanHalf * aspect * rz + this.pointer.y * tanHalf * uz;
    const dl = Math.hypot(dx, dy, dz);
    this.falcon = {
      x: this.eye[0] + (dx / dl) * CAM_DIST,
      y: this.eye[1] + (dy / dl) * CAM_DIST,
      z: this.eye[2] + (dz / dl) * CAM_DIST
    };
  }

  handlePointerMove(e) {
    this.pointer = {
      x: ((e.clientX - this.rect.left) / this.rect.width) * 2 - 1,
      y: -(((e.clientY - this.rect.top) / this.rect.height) * 2 - 1)
    };
  }

  handlePointerDown() {
    this.updateFalcon();
    if (!this.falcon) return;
    const radius = 260;
    for (let i = 0; i < this.count; i++) {
      const dx = this.px[i] - this.falcon.x;
      const dy = this.py[i] - this.falcon.y;
      const dz = this.pz[i] - this.falcon.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius && d > 0.001) {
        const force = (1 - d / radius) * 11;
        this.vx[i] += (dx / d) * force;
        this.vy[i] += (dy / d) * force;
        this.vz[i] += (dz / d) * force;
      }
    }
  }

  handlePointerLeave() {
    this.pointer = null;
    this.falcon = null;
  }

  cellIndex(x, y, z) {
    const dim = this.gridDim;
    let gx = ((x + GRID_EXTENT) / PERCEPTION) | 0;
    let gy = ((y + GRID_EXTENT) / PERCEPTION) | 0;
    let gz = ((z + GRID_EXTENT) / PERCEPTION) | 0;
    gx = gx < 0 ? 0 : gx >= dim ? dim - 1 : gx;
    gy = gy < 0 ? 0 : gy >= dim ? dim - 1 : gy;
    gz = gz < 0 ? 0 : gz >= dim ? dim - 1 : gz;
    return (gy * dim + gz) * dim + gx;
  }

  buildGrid() {
    const cellStart = this.cellStart;
    cellStart.fill(0);
    for (let i = 0; i < this.count; i++) {
      const cell = this.cellIndex(this.px[i], this.py[i], this.pz[i]);
      this.cellOf[i] = cell;
      cellStart[cell + 1]++;
    }
    for (let c = 1; c < cellStart.length; c++) cellStart[c] += cellStart[c - 1];
    this.cellCursor.fill(0);
    for (let i = 0; i < this.count; i++) {
      const cell = this.cellOf[i];
      this.gridIndices[cellStart[cell] + this.cellCursor[cell]++] = i;
    }
  }

  updateFlock() {
    this.buildGrid();

    const dim = this.gridDim;
    const maxSpeed = 4.2;
    const minSpeed = 1.6;
    const maxForce = 0.14;
    const perceptionSq = PERCEPTION * PERCEPTION;
    const sepRadiusSq = SEP_RADIUS * SEP_RADIUS;

    // The vortex breathes: winds up into a spiral, then releases
    const breath = 0.5 + 0.5 * Math.sin(this.time * 0.07);
    const vortex = this.vortexStrength * (0.15 + 0.85 * breath) * 0.16;

    // Wandering 3D target keeps the flock roaming between vortex phases
    const tx = Math.cos(this.time * 0.11) * WORLD_RADIUS * 0.45;
    const ty = Math.sin(this.time * 0.07) * WORLD_RADIUS * 0.3;
    const tz = Math.sin(this.time * 0.13) * WORLD_RADIUS * 0.45;

    for (let i = 0; i < this.count; i++) {
      const xi = this.px[i], yi = this.py[i], zi = this.pz[i];
      let ax = 0, ay = 0, az = 0;

      let n = 0;
      let sumVx = 0, sumVy = 0, sumVz = 0;
      let sumX = 0, sumY = 0, sumZ = 0;
      let sepX = 0, sepY = 0, sepZ = 0;

      let gx = ((xi + GRID_EXTENT) / PERCEPTION) | 0;
      let gy = ((yi + GRID_EXTENT) / PERCEPTION) | 0;
      let gz = ((zi + GRID_EXTENT) / PERCEPTION) | 0;
      gx = gx < 1 ? 1 : gx >= dim - 1 ? dim - 2 : gx;
      gy = gy < 1 ? 1 : gy >= dim - 1 ? dim - 2 : gy;
      gz = gz < 1 ? 1 : gz >= dim - 1 ? dim - 2 : gz;

      outer:
      for (let cy = gy - 1; cy <= gy + 1; cy++) {
        for (let cz = gz - 1; cz <= gz + 1; cz++) {
          const rowBase = (cy * dim + cz) * dim;
          for (let cx = gx - 1; cx <= gx + 1; cx++) {
            const cell = rowBase + cx;
            const end = this.cellStart[cell + 1];
            for (let k = this.cellStart[cell]; k < end; k++) {
              const j = this.gridIndices[k];
              if (j === i) continue;
              const dx = this.px[j] - xi;
              const dy = this.py[j] - yi;
              const dz = this.pz[j] - zi;
              const dSq = dx * dx + dy * dy + dz * dz;
              if (dSq > perceptionSq) continue;

              sumVx += this.vx[j]; sumVy += this.vy[j]; sumVz += this.vz[j];
              sumX += this.px[j]; sumY += this.py[j]; sumZ += this.pz[j];
              if (dSq < sepRadiusSq && dSq > 0.0001) {
                const inv = 1 / dSq;
                sepX -= dx * inv; sepY -= dy * inv; sepZ -= dz * inv;
              }
              if (++n >= MAX_NEIGHBORS) break outer;
            }
          }
        }
      }

      const vxi = this.vx[i], vyi = this.vy[i], vzi = this.vz[i];

      if (n > 0) {
        // Alignment
        let dx = sumVx / n, dy = sumVy / n, dz = sumVz / n;
        let mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        let sx = (dx / mag) * maxSpeed - vxi;
        let sy = (dy / mag) * maxSpeed - vyi;
        let sz = (dz / mag) * maxSpeed - vzi;
        mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (mag > maxForce) { const s = maxForce / mag; sx *= s; sy *= s; sz *= s; }
        ax += sx * 0.9; ay += sy * 0.9; az += sz * 0.9;

        // Cohesion
        dx = sumX / n - xi; dy = sumY / n - yi; dz = sumZ / n - zi;
        mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        sx = (dx / mag) * maxSpeed - vxi;
        sy = (dy / mag) * maxSpeed - vyi;
        sz = (dz / mag) * maxSpeed - vzi;
        mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (mag > maxForce) { const s = maxForce / mag; sx *= s; sy *= s; sz *= s; }
        ax += sx * 0.5; ay += sy * 0.5; az += sz * 0.5;

        // Separation
        mag = Math.sqrt(sepX * sepX + sepY * sepY + sepZ * sepZ);
        if (mag > 0.0001) {
          sx = (sepX / mag) * maxSpeed - vxi;
          sy = (sepY / mag) * maxSpeed - vyi;
          sz = (sepZ / mag) * maxSpeed - vzi;
          mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
          if (mag > maxForce) { const s = maxForce / mag; sx *= s; sy *= s; sz *= s; }
          ax += sx * 1.7; ay += sy * 1.7; az += sz * 1.7;
        }
      }

      // Vortex: tangential swirl around the Y axis with inward pull and lift
      {
        const r = Math.sqrt(xi * xi + zi * zi) || 1;
        const falloff = Math.min(1, r / 120); // calm core at the axis
        ax += (-zi / r) * vortex * falloff;
        az += (xi / r) * vortex * falloff;
        ax += (-xi / r) * vortex * 0.35;       // inward winding
        az += (-zi / r) * vortex * 0.35;
        ay += Math.sin(this.time * 0.5 + r * 0.01) * vortex * 0.4; // columns rise and fall
      }

      // Falcon flee in 3D
      if (this.falcon) {
        const dx = xi - this.falcon.x;
        const dy = yi - this.falcon.y;
        const dz = zi - this.falcon.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < FALCON_RADIUS && d > 0.001) {
          const force = Math.pow(1 - d / FALCON_RADIUS, 2) * 1.1;
          ax += (dx / d) * force;
          ay += (dy / d) * force;
          az += (dz / d) * force;
        }
      }

      // Wandering target (weak)
      {
        const dx = tx - xi, dy = ty - yi, dz = tz - zi;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        ax += (dx / d) * 0.014;
        ay += (dy / d) * 0.014;
        az += (dz / d) * 0.014;
      }

      // Soft spherical containment
      {
        const d = Math.sqrt(xi * xi + yi * yi + zi * zi);
        if (d > WORLD_RADIUS) {
          const pull = ((d - WORLD_RADIUS) / WORLD_RADIUS) * 0.3;
          ax -= (xi / d) * pull;
          ay -= (yi / d) * pull;
          az -= (zi / d) * pull;
        }
      }

      // Integrate with speed clamping
      let nvx = vxi + ax, nvy = vyi + ay, nvz = vzi + az;
      const speed = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz) || 1;
      const clamped = speed > maxSpeed ? maxSpeed : speed < minSpeed ? minSpeed : speed;
      const s = clamped / speed;
      nvx *= s; nvy *= s; nvz *= s;

      this.vx[i] = nvx; this.vy[i] = nvy; this.vz[i] = nvz;
      this.px[i] = xi + nvx;
      this.py[i] = yi + nvy;
      this.pz[i] = zi + nvz;
    }

    this.time += 0.016;
    this.camYaw += 0.0012; // slow orbital drift around the flock
  }

  render() {
    const gl = this.gl;
    const vp = this.computeCamera();
    this.updateFalcon();

    // Pack interleaved upload buffers
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      this.posBuffer[o] = this.px[i];
      this.posBuffer[o + 1] = this.py[i];
      this.posBuffer[o + 2] = this.pz[i];
      this.velBuffer[o] = this.vx[i];
      this.velBuffer[o + 1] = this.vy[i];
      this.velBuffer[o + 2] = this.vz[i];
    }

    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.vp, false, vp);
    gl.uniform3f(this.uniforms.eye, this.eye[0], this.eye[1], this.eye[2]);
    gl.uniform1f(this.uniforms.aspect, this.rect.width / this.rect.height);
    gl.uniform1f(this.uniforms.time, this.time);
    gl.uniform1f(this.uniforms.shimmer, this.shimmer);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.pos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.posBuffer, 0, this.count * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vel);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.velBuffer, 0, this.count * 3);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }

  renderBackground() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.rect.width, h = this.rect.height;
    this.bgCanvas.width = w * dpr;
    this.bgCanvas.height = h * dpr;
    this.bgCanvas.style.width = w + 'px';
    this.bgCanvas.style.height = h + 'px';
    const ctx = this.bgCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Deep twilight with a faint nebula heart where the vortex forms
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#05030f');
    base.addColorStop(0.6, '#0d0a22');
    base.addColorStop(1, '#1a1030');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.55);
    glow.addColorStop(0, 'rgba(80, 50, 130, 0.22)');
    glow.addColorStop(0.6, 'rgba(40, 25, 80, 0.1)');
    glow.addColorStop(1, 'rgba(40, 25, 80, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 140; i++) {
      const a = 0.1 + Math.random() * 0.6;
      ctx.fillStyle = `rgba(220, 215, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 0.3 + Math.random() * 0.9, 0, Math.PI * 2);
      ctx.fill();
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

    const flockSlider = document.createElement('div');
    flockSlider.className = 'control-slider';
    flockSlider.innerHTML = `
      <label>Birds</label>
      <input type="range" id="vortex-flock-slider" min="200" max="${MAX_BIRDS}" value="${this.flockSize}" step="100">
      <span id="vortex-flock-value">${this.flockSize}</span>
    `;
    controlsContainer.appendChild(flockSlider);

    document.getElementById('vortex-flock-slider')?.addEventListener('input', (e) => {
      this.flockSize = parseInt(e.target.value);
      document.getElementById('vortex-flock-value').textContent = this.flockSize;
      if (this.flockSize > this.count) {
        this.spawnBirds(this.flockSize);
      } else {
        this.count = this.flockSize;
      }
    });

    const vortexSlider = document.createElement('div');
    vortexSlider.className = 'control-slider';
    vortexSlider.innerHTML = `
      <label>Vortex</label>
      <input type="range" id="vortex-strength-slider" min="0" max="2.5" value="${this.vortexStrength}" step="0.1">
      <span id="vortex-strength-value">${this.vortexStrength.toFixed(1)}</span>
    `;
    controlsContainer.appendChild(vortexSlider);

    document.getElementById('vortex-strength-slider')?.addEventListener('input', (e) => {
      this.vortexStrength = parseFloat(e.target.value);
      document.getElementById('vortex-strength-value').textContent = this.vortexStrength.toFixed(1);
    });

    const shimmerSlider = document.createElement('div');
    shimmerSlider.className = 'control-slider';
    shimmerSlider.innerHTML = `
      <label>Shimmer</label>
      <input type="range" id="vortex-shimmer-slider" min="0" max="2" value="${this.shimmer}" step="0.1">
      <span id="vortex-shimmer-value">${this.shimmer.toFixed(1)}</span>
    `;
    controlsContainer.appendChild(shimmerSlider);

    document.getElementById('vortex-shimmer-slider')?.addEventListener('input', (e) => {
      this.shimmer = parseFloat(e.target.value);
      document.getElementById('vortex-shimmer-value').textContent = this.shimmer.toFixed(1);
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

    if (this.glCanvas) {
      this.glCanvas.width = rect.width * dpr;
      this.glCanvas.height = rect.height * dpr;
      this.glCanvas.style.width = rect.width + 'px';
      this.glCanvas.style.height = rect.height + 'px';
    }
    if (this.bgCanvas) this.renderBackground();
  }

  start() {
    if (!this.gl) return;
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
    this.flockSize = 2000;
    this.vortexStrength = 1.0;
    this.shimmer = 1.0;
    this.count = 0;
    this.time = 0;
    this.camYaw = 0;
    this.spawnBirds(this.flockSize);

    const pairs = [
      ['vortex-flock-slider', 'vortex-flock-value', '2000', '2000'],
      ['vortex-strength-slider', 'vortex-strength-value', '1', '1.0'],
      ['vortex-shimmer-slider', 'vortex-shimmer-value', '1', '1.0']
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

    if (this.gl) {
      const gl = this.gl;
      for (const key of Object.keys(this.buffers)) gl.deleteBuffer(this.buffers[key]);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }

    if (this.glCanvas) {
      this.glCanvas.removeEventListener('pointermove', this.handlePointerMove);
      this.glCanvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.glCanvas.removeEventListener('pointerleave', this.handlePointerLeave);
      this.glCanvas.remove();
    }
    if (this.bgCanvas) this.bgCanvas.remove();
    if (this.fpsElement) this.fpsElement.remove();

    const controlsContainer = document.getElementById('exhibit-controls');
    if (controlsContainer) controlsContainer.innerHTML = '';
  }
}
