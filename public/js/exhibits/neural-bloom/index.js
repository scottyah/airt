export default class NeuralBloom {
  constructor(container, config) {
    this.container = container;
    this.config = config;

    if (!window.THREE) {
      throw new Error('THREE.js not loaded');
    }
    this.THREE = window.THREE;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mesh = null;
    this.controls = null;
    this.clock = new this.THREE.Clock();
    this.isPaused = false;
  }

  async init() {
    const { clientWidth, clientHeight } = this.container;

    // Scene
    this.scene = new this.THREE.Scene();

    // Camera
    this.camera = new this.THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    this.camera.position.z = 3;

    // Renderer
    this.renderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(clientWidth, clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Geometry & Material
    this.createSculpture();

    // Controls
    // Dynamically import OrbitControls
    try {
      const { OrbitControls } = await import('/lib/OrbitControls.js?v=' + Date.now());
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = 1.5;
      this.controls.maxDistance = 10;
    } catch (e) {
      console.error("Failed to load OrbitControls:", e);
    }
  }

  createSculpture() {
    const geometry = new this.THREE.IcosahedronGeometry(1, 128);

    const material = new this.THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0.0 },
        u_intensity: { value: 0.3 },
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_intensity;

        // 3D Simplex Noise function
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
                      i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0) * 2.0 + 1.0;
          vec4 s1 = floor(b1) * 2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }

        varying vec3 v_normal;
        varying vec3 v_pos;

        void main() {
          v_normal = normal;
          v_pos = position;

          float noise = snoise(position * 2.5 + u_time * 0.2);
          float displacement = (1.0 + noise) * u_intensity;

          vec3 newPosition = position + normal * displacement;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        varying vec3 v_normal;
        varying vec3 v_pos;

        // Helper to create a vibrant color
        vec3 hsb2rgb(in vec3 c) {
          vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
          rgb = rgb*rgb*(3.0-2.0*rgb);
          return c.z * mix(vec3(1.0), rgb, c.y);
        }

        void main() {
          vec3 viewDirection = normalize(cameraPosition - v_pos);
          float fresnel = 1.0 - dot(viewDirection, v_normal);

          float hue = mod(v_pos.y * 0.2 + u_time * 0.1, 1.0);

          vec3 color = hsb2rgb(vec3(hue, 0.7, 0.9));

          gl_FragColor = vec4(color * fresnel, fresnel * 0.8 + 0.2);
        }
      `,
      transparent: true,
      blending: this.THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new this.THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  start() {
    this.isPaused = false;
    this.animate();
  }

  stop() {
    this.isPaused = true;
  }

  animate() {
    if (this.isPaused) return;

    requestAnimationFrame(() => this.animate());

    const elapsedTime = this.clock.getElapsedTime();
    this.mesh.material.uniforms.u_time.value = elapsedTime;

    if (this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  reset() {
    if (this.mesh) {
      this.mesh.rotation.set(0, 0, 0);
      this.clock.start(); // Restart the clock
    }
    if (this.controls) {
      this.controls.reset();
    }
    this.camera.position.z = 3;
  }

  togglePause() {
    this.isPaused ? this.start() : this.stop();
  }

  destroy() {
    this.stop();
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    if (this.controls) {
      this.controls.dispose();
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mesh = null;
  }
}
