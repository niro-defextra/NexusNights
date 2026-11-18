import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type PlatformId = 'android' | 'tv' | 'discord';

/**
 * Three physical devices, suspended in a dark volume and lit by one crimson key
 * and one gilt rim. The scene is the page's authored motion moment: it drifts
 * slowly, answers the pointer, and leans toward whichever platform the reader
 * is looking at.
 */
export default function Constellation({ active }: { active: PlatformId | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<PlatformId | null>(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // No WebGL: the hero still reads on its type and rules alone.
      host.dataset.failed = 'true';
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    camera.position.set(0, 0.12, 7.4);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.85;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const key = new THREE.PointLight(0xb3202f, 150, 30, 2);
    key.position.set(-4.2, -2.4, 4.6);
    scene.add(key);

    const rim = new THREE.PointLight(0xd4af6a, 95, 28, 2);
    rim.position.set(4.4, 2.6, -2.2);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xf2ebe3, 0.75);
    fill.position.set(0.6, 4, 5);
    scene.add(fill);

    const textures: THREE.Texture[] = [];

    const root = new THREE.Group();
    root.position.y = 0.05;
    scene.add(root);

    /* ── the lamp the devices are lit by ─────────────────────────────────── */

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 512;
    glowCanvas.height = 512;
    const gg = glowCanvas.getContext('2d');
    if (gg) {
      const grad = gg.createRadialGradient(256, 256, 8, 256, 256, 254);
      grad.addColorStop(0, 'rgba(179,32,47,0.34)');
      grad.addColorStop(0.42, 'rgba(140,25,37,0.14)');
      grad.addColorStop(1, 'rgba(140,25,37,0)');
      gg.fillStyle = grad;
      gg.fillRect(0, 0, 512, 512);
    }
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    textures.push(glowTex);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6.4),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.position.z = -1.9;
    root.add(glow);

    /* ── orbit lines ─────────────────────────────────────────────────────── */

    const orbits: THREE.Mesh[] = [];
    const orbitSpecs: Array<[number, number, number, [number, number, number]]> = [
      [2.35, 0x8c1925, 0.4, [0.34, 0.42, -0.2]],
      [2.95, 0xd4af6a, 0.15, [0.34, -0.3, 0.16]],
    ];
    for (const [radius, color, opacity, tilt] of orbitSpecs) {
      const geo = new THREE.TorusGeometry(radius, 0.0042, 6, 220);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.set(...tilt);
      root.add(ring);
      orbits.push(ring);
    }

    /* ── ambient stardust particles ───────────────────────────────────────── */

    const particleCount = 180;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const colBlood = new THREE.Color(0xdc3044);
    const colGilt = new THREE.Color(0xd4af6a);
    const colBone = new THREE.Color(0xf2ebe3);

    for (let i = 0; i < particleCount; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 12;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 0.5;

      const pick = i % 3 === 0 ? colBlood : i % 3 === 1 ? colGilt : colBone;
      particleColors[i * 3] = pick.r;
      particleColors[i * 3 + 1] = pick.g;
      particleColors[i * 3 + 2] = pick.b;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.038,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    /* ── screens ─────────────────────────────────────────────────────────── */

    function screenTexture(
      kind: 'phone' | 'tv' | 'tile',
    ): THREE.CanvasTexture {
      const w = kind === 'tv' ? 1024 : 704;
      const h = kind === 'tv' ? 576 : 704;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) throw new Error('no 2d');

      const bg = g.createLinearGradient(0, 0, w * 0.4, h);
      bg.addColorStop(0, '#2d181d');
      bg.addColorStop(0.55, '#190f12');
      bg.addColorStop(1, '#0e0a0b');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      // soft crimson bloom, upper-left, like a lamp off frame
      const bloom = g.createRadialGradient(w * 0.18, h * 0.16, 0, w * 0.18, h * 0.16, w * 0.7);
      bloom.addColorStop(0, 'rgba(220,48,68,0.38)');
      bloom.addColorStop(1, 'rgba(179,32,47,0)');
      g.fillStyle = bloom;
      g.fillRect(0, 0, w, h);

      // Authentic NexusNight Sigil + Brand Typography
      const sigil = (cx: number, cy: number, r: number, withWordmark = true) => {
        g.save();
        g.translate(cx, cy);

        // Ambient radial glow
        const rad = g.createRadialGradient(0, 0, 2, 0, 0, r * 1.55);
        rad.addColorStop(0, 'rgba(220,48,68,0.35)');
        rad.addColorStop(0.6, 'rgba(179,32,47,0.1)');
        rad.addColorStop(1, 'rgba(179,32,47,0)');
        g.fillStyle = rad;
        g.beginPath();
        g.arc(0, 0, r * 1.55, 0, Math.PI * 2);
        g.fill();

        // Outer Circle
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(220,48,68,0.12)';
        g.fill();
        g.lineWidth = Math.max(2, r * 0.065);
        g.strokeStyle = '#dc3044';
        g.stroke();

        // Inscribed Diamond
        g.beginPath();
        g.moveTo(0, -r * 0.88);
        g.lineTo(r * 0.88, 0);
        g.lineTo(0, r * 0.88);
        g.lineTo(-r * 0.88, 0);
        g.closePath();
        g.lineWidth = Math.max(1.8, r * 0.055);
        g.strokeStyle = '#d4af6a';
        g.stroke();

        // Inner jewel
        g.beginPath();
        g.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        g.fillStyle = '#d4af6a';
        g.fill();

        if (withWordmark) {
          const fontSize = Math.max(12, Math.round(r * 0.36));
          g.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
          
          const yOff = r + fontSize * 1.35;
          const nexus = 'NEXUS ';
          const nights = 'NIGHTS';
          const nexusWidth = g.measureText(nexus).width;
          const nightsWidth = g.measureText(nights).width;
          const totalWidth = nexusWidth + nightsWidth;
          const startX = -totalWidth / 2;

          g.textBaseline = 'middle';
          g.fillStyle = '#dc3044';
          g.fillText(nexus, startX, yOff);
          g.fillStyle = '#d4af6a';
          g.fillText(nights, startX + nexusWidth, yOff);
        }

        g.restore();
      };

      if (kind === 'phone') {
        sigil(w / 2, h * 0.32, w * 0.18, true);
        // title rule + two content rows
        g.fillStyle = 'rgba(242,235,227,0.95)';
        g.fillRect(w * 0.16, h * 0.56, w * 0.32, 5);
        g.fillStyle = 'rgba(242,235,227,0.34)';
        for (let i = 0; i < 3; i++) {
          g.fillRect(w * 0.16, h * 0.62 + i * 48, w * (0.5 - i * 0.08), 4);
        }
        // live pip & timeline
        g.fillStyle = '#dc3044';
        g.fillRect(w * 0.16, h * 0.86, w * 0.055, 5);
        g.fillStyle = 'rgba(242,235,227,0.42)';
        g.fillRect(w * 0.24, h * 0.86, w * 0.6, 5);
      } else if (kind === 'tv') {
        sigil(w * 0.22, h * 0.40, h * 0.18, true);
        // a rail of three poster blocks at the right
        for (let i = 0; i < 3; i++) {
          g.fillStyle = i === 0 ? 'rgba(220,48,68,0.22)' : 'rgba(242,235,227,0.08)';
          g.fillRect(w * 0.60 + i * (w * 0.11), h * 0.26, w * 0.09, h * 0.46);
          g.fillStyle = i === 0 ? '#d4af6a' : 'rgba(242,235,227,0.24)';
          g.fillRect(w * 0.60 + i * (w * 0.11), h * 0.26, w * 0.09, 3);
        }
        // progress bar with crimson accent
        g.fillStyle = 'rgba(242,235,227,0.22)';
        g.fillRect(w * 0.075, h * 0.84, w * 0.85, 4);
        g.fillStyle = '#dc3044';
        g.fillRect(w * 0.075, h * 0.84, w * 0.32, 4);
      } else {
        // the voice room: three seats and a stage
        for (let i = 0; i < 3; i++) {
          const y = h * 0.28 + i * h * 0.17;
          g.beginPath();
          g.arc(w * 0.2, y, w * 0.055, 0, Math.PI * 2);
          g.fillStyle = i === 0 ? 'rgba(220,48,68,0.7)' : 'rgba(242,235,227,0.2)';
          g.fill();
          g.fillStyle = 'rgba(242,235,227,0.26)';
          g.fillRect(w * 0.3, y - 5, w * (0.4 - i * 0.06), 5);
        }
        // stage play mark
        g.beginPath();
        g.moveTo(w * 0.72, h * 0.42);
        g.lineTo(w * 0.72, h * 0.68);
        g.lineTo(w * 0.9, h * 0.55);
        g.closePath();
        g.fillStyle = 'rgba(242,235,227,0.92)';
        g.fill();
        // live bar
        g.fillStyle = '#dc3044';
        g.fillRect(w * 0.16, h * 0.85, w * 0.42, 4);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textures.push(tex);
      return tex;
    }

    /* ── slabs ───────────────────────────────────────────────────────────── */

    function roundedRect(w: number, h: number, r: number) {
      const s = new THREE.Shape();
      const x = -w / 2;
      const y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h);
      s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }

    interface Slab {
      group: THREE.Group;
      screen: THREE.MeshBasicMaterial;
      base: THREE.Vector3;
      baseRot: THREE.Euler;
      id: PlatformId;
      phase: number;
    }

    const slabs: Slab[] = [];

    function makeSlab(
      id: PlatformId,
      w: number,
      h: number,
      depth: number,
      radius: number,
      kind: 'phone' | 'tv' | 'tile',
      position: [number, number, number],
      rotation: [number, number, number],
    ) {
      const geo = new THREE.ExtrudeGeometry(roundedRect(w, h, radius), {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.018,
        bevelSegments: 3,
        curveSegments: 10,
      });
      geo.center();

      const body = new THREE.MeshPhysicalMaterial({
        color: 0x0e0b0c,
        metalness: 0.72,
        roughness: 0.34,
        clearcoat: 1,
        clearcoatRoughness: 0.14,
        envMapIntensity: 1.1,
      });

      const mesh = new THREE.Mesh(geo, body);
      const screenMat = new THREE.MeshBasicMaterial({
        map: screenTexture(kind),
        transparent: false,
        toneMapped: false,
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.93), screenMat);
      screen.position.z = depth / 2 + 0.0195;
      mesh.add(screen);

      // a hairline of gilt along the bottom edge — the one metal accent per device
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.92, 0.012),
        new THREE.MeshBasicMaterial({ color: 0xd4af6a, transparent: true, opacity: 0.5 }),
      );
      edge.position.set(0, -h * 0.465, depth / 2 + 0.0205);
      mesh.add(edge);

      const group = new THREE.Group();
      group.add(mesh);
      group.position.set(...position);
      group.rotation.set(...rotation);
      root.add(group);

      slabs.push({
        group,
        screen: screenMat,
        base: new THREE.Vector3(...position),
        baseRot: new THREE.Euler(...rotation),
        id,
        phase: slabs.length * 2.1,
      });
    }

    makeSlab('tv', 2.55, 1.44, 0.09, 0.05, 'tv', [0.92, 0.74, -0.15], [0.03, -0.3, 0.02]);
    makeSlab('android', 1.0, 2.0, 0.09, 0.12, 'phone', [-1.64, -0.08, 0.38], [0.04, 0.3, -0.05]);
    makeSlab('discord', 1.3, 1.3, 0.09, 0.13, 'tile', [0.84, -1.16, 0.7], [0.09, -0.1, 0.04]);

    /* ── pointer + viewport ──────────────────────────────────────────────── */

    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };

    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onPointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const BASE_DISTANCE = 7.4;
    const BASE_ASPECT = 1.21;

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.aspect = aspect;
      // Narrow stages pull the camera back so the three devices stay whole.
      camera.position.z = Math.min(BASE_DISTANCE * Math.max(1, BASE_ASPECT / aspect), 13);
      root.scale.setScalar(aspect < 1.2 ? 0.86 : 1);
      camera.updateProjectionMatrix();
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ── loop ────────────────────────────────────────────────────────────── */

    const started = performance.now();
    let raf = 0;
    let visible = true;

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0.02 },
    );
    io.observe(host);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;

      const t = (performance.now() - started) / 1000;

      eased.x = lerp(eased.x, pointer.x, 0.055);
      eased.y = lerp(eased.y, pointer.y, 0.055);

      root.rotation.y = Math.sin(t * 0.16) * 0.06 + eased.x * 0.2;
      root.rotation.x = -eased.y * 0.1;

      const current = activeRef.current;

      for (const slab of slabs) {
        const isActive = current === slab.id;
        const isOther = current !== null && !isActive;

        const driftY = Math.sin(t * 0.62 + slab.phase) * 0.045;
        const driftX = Math.cos(t * 0.44 + slab.phase) * 0.02;

        const targetZ = slab.base.z + (isActive ? 0.42 : isOther ? -0.22 : 0);
        const targetScale = isActive ? 1.05 : isOther ? 0.965 : 1;

        slab.group.position.x = lerp(slab.group.position.x, slab.base.x + driftX, 0.06);
        slab.group.position.y = lerp(slab.group.position.y, slab.base.y + driftY, 0.06);
        slab.group.position.z = lerp(slab.group.position.z, targetZ, 0.07);
        slab.group.scale.setScalar(lerp(slab.group.scale.x, targetScale, 0.07));

        slab.group.rotation.y = lerp(
          slab.group.rotation.y,
          slab.baseRot.y + eased.x * 0.16,
          0.06,
        );
        slab.group.rotation.x = lerp(
          slab.group.rotation.x,
          slab.baseRot.x - eased.y * 0.06,
          0.06,
        );

        // screens dim a step when another platform owns the moment
        const level = isOther ? 0.52 : 1;
        const c = slab.screen.color;
        c.r = lerp(c.r, level, 0.08);
        c.g = lerp(c.g, level, 0.08);
        c.b = lerp(c.b, level, 0.08);
      }

      for (const ring of orbits) {
        ring.rotation.z += 0.0006;
      }

      particles.rotation.y += 0.00025;
      particles.rotation.x += 0.0001;

      renderer.render(scene, camera);
    };

    if (reduced) {
      // One still frame at a composed angle; no loop, no pointer response.
      root.rotation.set(-0.02, 0.05, 0);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);

      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      textures.forEach((tex) => tex.dispose());
      orbits.length = 0;
      slabs.length = 0;

      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={hostRef} className="dl-stage-host" aria-hidden="true" />;
}
