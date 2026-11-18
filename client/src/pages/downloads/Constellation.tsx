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

    const particleCount = 220;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const colBlood = new THREE.Color(0xdc3044);
    const colGilt = new THREE.Color(0xd4af6a);
    const colBone = new THREE.Color(0xf2ebe3);

    for (let i = 0; i < particleCount; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 14;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 9;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 7 - 0.5;

      const pick = i % 3 === 0 ? colBlood : i % 3 === 1 ? colGilt : colBone;
      particleColors[i * 3] = pick.r;
      particleColors[i * 3 + 1] = pick.g;
      particleColors[i * 3 + 2] = pick.b;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.042,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    /* ── screen texture generator ─────────────────────────────────────────── */

    function screenTexture(
      kind: 'phone' | 'tv' | 'tile',
    ): THREE.CanvasTexture {
      const w = kind === 'tv' ? 1280 : kind === 'phone' ? 720 : 1280;
      const h = kind === 'tv' ? 720 : kind === 'phone' ? 1440 : 800;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) throw new Error('no 2d');

      // Authentic NexusNight Sigil + Brand Typography
      const drawSigil = (cx: number, cy: number, r: number) => {
        g.save();
        g.translate(cx, cy);

        // Ambient radial aura
        const rad = g.createRadialGradient(0, 0, 2, 0, 0, r * 1.6);
        rad.addColorStop(0, 'rgba(220,48,68,0.4)');
        rad.addColorStop(0.6, 'rgba(179,32,47,0.12)');
        rad.addColorStop(1, 'rgba(179,32,47,0)');
        g.fillStyle = rad;
        g.beginPath();
        g.arc(0, 0, r * 1.6, 0, Math.PI * 2);
        g.fill();

        // Outer Ring
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(220,48,68,0.15)';
        g.fill();
        g.lineWidth = Math.max(2, r * 0.07);
        g.strokeStyle = '#dc3044';
        g.stroke();

        // Inscribed Diamond
        g.beginPath();
        g.moveTo(0, -r * 0.88);
        g.lineTo(r * 0.88, 0);
        g.lineTo(0, r * 0.88);
        g.lineTo(-r * 0.88, 0);
        g.closePath();
        g.lineWidth = Math.max(1.8, r * 0.06);
        g.strokeStyle = '#d4af6a';
        g.stroke();

        // Center Jewel Pip
        g.beginPath();
        g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        g.fillStyle = '#d4af6a';
        g.fill();

        g.restore();
      };

      const drawBrand = (x: number, y: number, r: number, fontSize: number) => {
        drawSigil(x, y, r);
        g.save();
        g.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
        g.textBaseline = 'middle';
        g.fillStyle = '#dc3044';
        g.fillText('NEXUS', x + r + 10, y);
        const nw = g.measureText('NEXUS ').width;
        g.fillStyle = '#d4af6a';
        g.fillText('NIGHTS', x + r + 10 + nw, y);
        g.restore();
      };

      if (kind === 'tv') {
        // Deep cinema gradient
        const bg = g.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#1c080e');
        bg.addColorStop(0.4, '#0f080b');
        bg.addColorStop(1, '#070506');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);

        // Cosmic nebula wash
        const nebula = g.createRadialGradient(w * 0.25, h * 0.25, 10, w * 0.25, h * 0.25, w * 0.7);
        nebula.addColorStop(0, 'rgba(220,48,68,0.32)');
        nebula.addColorStop(0.5, 'rgba(140,25,37,0.12)');
        nebula.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = nebula;
        g.fillRect(0, 0, w, h);

        // 1. Top Navigation Bar
        drawBrand(64, 48, 18, 22);

        // Nav tabs
        const navs = ['الرئيسية (Home)', 'أفلام (Movies)', 'مسلسلات (Series)', 'بث مباشر (Sports)'];
        g.font = '600 15px system-ui, sans-serif';
        let nx = 340;
        navs.forEach((item, idx) => {
          if (idx === 0) {
            g.fillStyle = '#f2ebe3';
            g.fillText(item, nx, 48);
            g.fillStyle = '#d4af6a';
            g.fillRect(nx, 64, g.measureText(item).width, 3);
          } else {
            g.fillStyle = 'rgba(242,235,227,0.55)';
            if (idx === 3) {
              // green live dot
              g.save();
              g.fillStyle = '#10b981';
              g.beginPath();
              g.arc(nx - 8, 48, 4, 0, Math.PI * 2);
              g.fill();
              g.restore();
            }
            g.fillText(item, nx, 48);
          }
          nx += g.measureText(item).width + 36;
        });

        // Top-right Profile & Clock
        g.fillStyle = 'rgba(242,235,227,0.85)';
        g.font = '700 16px monospace';
        g.fillText('21:45', w - 110, 48);
        g.beginPath();
        g.arc(w - 48, 48, 16, 0, Math.PI * 2);
        g.fillStyle = '#2b2125';
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = '#d4af6a';
        g.stroke();

        // 2. Featured Hero Premiere Banner
        // Badge
        g.fillStyle = 'rgba(220,48,68,0.25)';
        g.fillRect(64, 130, 160, 26);
        g.strokeStyle = '#dc3044';
        g.lineWidth = 1;
        g.strokeRect(64, 130, 160, 26);
        g.fillStyle = '#dc3044';
        g.font = '800 12px system-ui, sans-serif';
        g.fillText('العرض الأول • PREMIERE', 76, 147);

        // Title
        g.fillStyle = '#ffffff';
        g.font = '900 48px system-ui, sans-serif';
        g.fillText('DUNE: PART TWO', 64, 210);

        // Meta tags
        const tags = ['4K ULTRA HD', 'DOLBY ATMOS', '★ 9.1', '2h 46m'];
        let tx = 64;
        g.font = '700 12px monospace';
        tags.forEach((tag, i) => {
          const tw = g.measureText(tag).width + 16;
          g.fillStyle = i === 2 ? 'rgba(212,175,106,0.2)' : 'rgba(255,255,255,0.08)';
          g.fillRect(tx, 232, tw, 22);
          g.fillStyle = i === 2 ? '#d4af6a' : 'rgba(255,255,255,0.7)';
          g.fillText(tag, tx + 8, 247);
          tx += tw + 10;
        });

        // CTA Buttons
        // Primary "Watch Now"
        g.fillStyle = '#dc3044';
        g.beginPath();
        g.roundRect ? g.roundRect(64, 276, 170, 44, 8) : g.rect(64, 276, 170, 44);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = '800 16px system-ui, sans-serif';
        g.fillText('▶  مشاهدة الآن', 96, 303);

        // Secondary "Watchlist"
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.roundRect ? g.roundRect(248, 276, 140, 44, 8) : g.rect(248, 276, 140, 44);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.2)';
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.font = '600 15px system-ui, sans-serif';
        g.fillText('+ المفضلة', 282, 303);

        // 3. Trending Carousel (Bottom Row)
        g.fillStyle = '#ffffff';
        g.font = '800 18px system-ui, sans-serif';
        g.fillText('الأكثر رواجاً الليلة • Trending Tonight', 64, 385);

        const posters = [
          { title: 'Interstellar', cat: 'Sci-Fi · 4K', col: '#1e3a5f', bar: 0.65 },
          { title: 'Oppenheimer', cat: 'Drama · HDR', col: '#4a1515', bar: 0.35 },
          { title: 'Cyberpunk 2077', cat: 'Anime · 1080p', col: '#1f4037', bar: 0.9 },
          { title: 'Real Madrid vs Man City', cat: 'دوري الأبطال • 2 : 1 LIVE', col: '#0d253a', live: true },
        ];

        posters.forEach((p, i) => {
          const px = 64 + i * 285;
          const py = 410;
          const pw = 265;
          const ph = 240;

          // Poster card
          const cardGrad = g.createLinearGradient(px, py, px, py + ph);
          cardGrad.addColorStop(0, p.col);
          cardGrad.addColorStop(1, '#0e0b0d');
          g.fillStyle = cardGrad;
          g.beginPath();
          g.roundRect ? g.roundRect(px, py, pw, ph, 10) : g.rect(px, py, pw, ph);
          g.fill();
          g.strokeStyle = i === 0 ? 'rgba(212,175,106,0.5)' : 'rgba(255,255,255,0.12)';
          g.stroke();

          // Live pill if sports
          if (p.live) {
            g.fillStyle = '#dc3044';
            g.fillRect(px + 12, py + 12, 60, 20);
            g.fillStyle = '#ffffff';
            g.font = '800 10px sans-serif';
            g.fillText('مباشر 🔴', px + 20, py + 26);
          }

          // Title & Meta
          g.fillStyle = '#ffffff';
          g.font = '800 16px system-ui, sans-serif';
          g.fillText(p.title, px + 14, py + ph - 42);

          g.fillStyle = p.live ? '#10b981' : 'rgba(242,235,227,0.6)';
          g.font = '600 12px sans-serif';
          g.fillText(p.cat, px + 14, py + ph - 22);

          // Progress bar
          if (p.bar) {
            g.fillStyle = 'rgba(255,255,255,0.2)';
            g.fillRect(px + 14, py + ph - 10, pw - 28, 3);
            g.fillStyle = '#dc3044';
            g.fillRect(px + 14, py + ph - 10, (pw - 28) * p.bar, 3);
          }
        });

        // Global cinema bottom progress
        g.fillStyle = 'rgba(255,255,255,0.1)';
        g.fillRect(0, h - 6, w, 6);
        g.fillStyle = '#dc3044';
        g.fillRect(0, h - 6, w * 0.42, 6);
      } else if (kind === 'phone') {
        // Phone screen (720x1440)
        const bg = g.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#1c0a10');
        bg.addColorStop(0.35, '#0e090b');
        bg.addColorStop(1, '#050405');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);

        // Status Bar
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = '800 24px monospace';
        g.fillText('21:45', 48, 54);
        g.font = '700 18px sans-serif';
        g.fillText('5G  100%', w - 130, 54);

        // Dynamic Island pill
        g.fillStyle = '#000000';
        g.beginPath();
        g.roundRect ? g.roundRect(w / 2 - 80, 26, 160, 42, 21) : g.rect(w / 2 - 80, 26, 160, 42);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.15)';
        g.stroke();

        // App Bar
        drawBrand(50, 130, 20, 26);

        // Search icon circle
        g.beginPath();
        g.arc(w - 60, 130, 22, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fill();

        // 1. "Continue Watching" Card
        const cwx = 40;
        const cwy = 190;
        const cww = w - 80;
        const cwh = 340;

        const cwGrad = g.createLinearGradient(cwx, cwy, cwx + cww, cwy + cwh);
        cwGrad.addColorStop(0, '#2d1018');
        cwGrad.addColorStop(1, '#110d10');
        g.fillStyle = cwGrad;
        g.beginPath();
        g.roundRect ? g.roundRect(cwx, cwy, cww, cwh, 18) : g.rect(cwx, cwy, cww, cwh);
        g.fill();
        g.strokeStyle = 'rgba(220,48,68,0.4)';
        g.stroke();

        // Movie poster image representation
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(cwx, cwy + 180, cww, cwh - 180);

        g.fillStyle = '#ffffff';
        g.font = '800 28px system-ui, sans-serif';
        g.fillText('Interstellar', cwx + 24, cwy + 230);
        g.fillStyle = '#d4af6a';
        g.font = '600 18px sans-serif';
        g.fillText('متبقي 42 دقيقة • 1h 48m left', cwx + 24, cwy + 265);

        // Play button circle
        g.beginPath();
        g.arc(cwx + cww - 54, cwy + 245, 30, 0, Math.PI * 2);
        g.fillStyle = '#dc3044';
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(cwx + cww - 48, cwy + 245);
        g.lineTo(cwx + cww - 60, cwy + 235);
        g.lineTo(cwx + cww - 60, cwy + 255);
        g.fill();

        // Progress bar inside card
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(cwx + 24, cwy + cwh - 24, cww - 48, 6);
        g.fillStyle = '#dc3044';
        g.fillRect(cwx + 24, cwy + cwh - 24, (cww - 48) * 0.72, 6);

        // 2. Room Watch Party Card
        const rwx = 40;
        const rwy = 560;
        const rww = w - 80;
        const rwh = 140;

        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.roundRect ? g.roundRect(rwx, rwy, rww, rwh, 16) : g.rect(rwx, rwy, rww, rwh);
        g.fill();
        g.strokeStyle = 'rgba(212,175,106,0.3)';
        g.stroke();

        g.fillStyle = '#d4af6a';
        g.font = '800 20px system-ui, sans-serif';
        g.fillText('سهرة ديسكورد المشتركة • Live Room', rwx + 20, rwy + 45);

        g.fillStyle = 'rgba(242,235,227,0.7)';
        g.font = '600 16px sans-serif';
        g.fillText('4 أصدقاء يشاهدون الآن في نفس اللحظة', rwx + 20, rwy + 80);

        // Avatar bubbles
        const aColors = ['#dc3044', '#d4af6a', '#3b82f6', '#10b981'];
        aColors.forEach((ac, idx) => {
          g.beginPath();
          g.arc(rwx + rww - 40 - idx * 26, rwy + 65, 18, 0, Math.PI * 2);
          g.fillStyle = ac;
          g.fill();
          g.lineWidth = 2;
          g.strokeStyle = '#0e090b';
          g.stroke();
        });

        // 3. Grid of Posters
        g.fillStyle = '#ffffff';
        g.font = '800 26px system-ui, sans-serif';
        g.fillText('أحدث الإضافات • New Releases', 40, 750);

        const mposters = [
          { t: 'Gladiator II', col: '#3a1515' },
          { t: 'Oppenheimer', col: '#182b3d' },
          { t: 'Batman', col: '#221e25' },
          { t: 'Spider-Man', col: '#331215' },
        ];

        mposters.forEach((mp, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const mw = (w - 100) / 2;
          const mh = 220;
          const mx = 40 + col * (mw + 20);
          const my = 780 + row * (mh + 20);

          const mg = g.createLinearGradient(mx, my, mx, my + mh);
          mg.addColorStop(0, mp.col);
          mg.addColorStop(1, '#0e0b0d');
          g.fillStyle = mg;
          g.beginPath();
          g.roundRect ? g.roundRect(mx, my, mw, mh, 14) : g.rect(mx, my, mw, mh);
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.1)';
          g.stroke();

          g.fillStyle = '#ffffff';
          g.font = '800 18px system-ui, sans-serif';
          g.fillText(mp.t, mx + 16, my + mh - 26);
        });

        // Bottom Navigation Bar
        const by = h - 110;
        g.fillStyle = 'rgba(10,7,8,0.92)';
        g.fillRect(0, by, w, 110);
        g.strokeStyle = 'rgba(255,255,255,0.1)';
        g.beginPath();
        g.moveTo(0, by);
        g.lineTo(w, by);
        g.stroke();

        const tabs = ['الرئيسية', 'رياضة', 'التنزيلات', 'حسابي'];
        tabs.forEach((tab, i) => {
          const tx = (w / 4) * i + w / 8;
          g.textAlign = 'center';
          g.fillStyle = i === 2 ? '#d4af6a' : 'rgba(242,235,227,0.5)';
          g.font = i === 2 ? '800 16px sans-serif' : '600 15px sans-serif';
          g.fillText(tab, tx, by + 65);
          if (i === 2) {
            g.fillRect(tx - 16, by + 82, 32, 3);
          }
        });
        g.textAlign = 'left';
      } else {
        // Discord Studio / Laptop Screen (1280x800)
        g.fillStyle = '#1e1f22';
        g.fillRect(0, 0, w, h);

        // macOS Window Header
        g.fillStyle = '#111214';
        g.fillRect(0, 0, w, 44);
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.moveTo(0, 44);
        g.lineTo(w, 44);
        g.stroke();

        // Traffic lights
        const tColors = ['#ff5f56', '#ffbd2e', '#27c93f'];
        tColors.forEach((tc, idx) => {
          g.beginPath();
          g.arc(28 + idx * 20, 22, 6, 0, Math.PI * 2);
          g.fillStyle = tc;
          g.fill();
        });

        g.fillStyle = 'rgba(242,235,227,0.8)';
        g.font = '700 14px system-ui, sans-serif';
        g.fillText('Discord • # Cinema-Lounge • NexusNights Activity', 110, 27);

        // 1. Left Sidebar (Channels & Voice Room)
        const sw = 280;
        g.fillStyle = '#18191c';
        g.fillRect(0, 44, sw, h - 44);
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.moveTo(sw, 44);
        g.lineTo(sw, h);
        g.stroke();

        // Server header
        drawBrand(24, 76, 14, 16);

        g.fillStyle = 'rgba(242,235,227,0.4)';
        g.font = '800 11px system-ui, sans-serif';
        g.fillText('VOICE CHANNELS', 24, 130);

        // Active voice room
        g.fillStyle = 'rgba(220,48,68,0.15)';
        g.beginPath();
        g.roundRect ? g.roundRect(14, 145, sw - 28, 40, 8) : g.rect(14, 145, sw - 28, 40);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = '700 14px system-ui, sans-serif';
        g.fillText('🔊  Cinema Lounge (4)', 28, 170);

        // Active voice participants with green rings
        const users = [
          { name: 'Karim (Host 👑)', col: '#dc3044', talking: true },
          { name: 'Sarah', col: '#d4af6a', talking: true },
          { name: 'Alex', col: '#3b82f6', talking: false },
          { name: 'Zaid', col: '#10b981', talking: false },
        ];

        users.forEach((u, idx) => {
          const uy = 210 + idx * 46;
          // Avatar
          g.beginPath();
          g.arc(40, uy, 15, 0, Math.PI * 2);
          g.fillStyle = u.col;
          g.fill();
          if (u.talking) {
            g.lineWidth = 2.5;
            g.strokeStyle = '#23a55a'; // Discord speaking green!
            g.stroke();
          }

          g.fillStyle = u.talking ? '#ffffff' : 'rgba(242,235,227,0.65)';
          g.font = '600 14px system-ui, sans-serif';
          g.fillText(u.name, 68, uy + 5);
        });

        // 2. Main Stage Video Player (Center)
        const vw = w - sw - 320;
        const vh = h - 44;
        const vx = sw;
        const vy = 44;

        // Player canvas
        const pGrad = g.createLinearGradient(vx, vy, vx + vw, vy + vh);
        pGrad.addColorStop(0, '#260a12');
        pGrad.addColorStop(0.5, '#120b0e');
        pGrad.addColorStop(1, '#070506');
        g.fillStyle = pGrad;
        g.fillRect(vx, vy, vw, vh);

        // Live Cinema Art representation
        drawSigil(vx + vw / 2, vy + vh / 2 - 30, 60);

        g.fillStyle = '#ffffff';
        g.font = '900 36px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('NEXUS NIGHTS CINEMA', vx + vw / 2, vy + vh / 2 + 55);

        g.fillStyle = '#10b981';
        g.font = '700 14px monospace';
        g.fillText('● 1080p 60FPS • SYNCHRONIZED STREAM', vx + vw / 2, vy + vh / 2 + 85);
        g.textAlign = 'left';

        // In-player seekbar at bottom of stage
        g.fillStyle = 'rgba(0,0,0,0.85)';
        g.fillRect(vx, vy + vh - 60, vw, 60);

        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(vx + 24, vy + vh - 32, vw - 48, 4);
        g.fillStyle = '#dc3044';
        g.fillRect(vx + 24, vy + vh - 32, (vw - 48) * 0.64, 4);

        g.fillStyle = '#ffffff';
        g.font = '700 13px monospace';
        g.fillText('01:14:20 / 02:26:00', vx + 24, vy + vh - 12);

        // 3. Right Sidebar (In-Room Chat Stream)
        const cx = w - 320;
        g.fillStyle = '#18191c';
        g.fillRect(cx, 44, 320, h - 44);
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.moveTo(cx, 44);
        g.lineTo(cx, h);
        g.stroke();

        g.fillStyle = 'rgba(242,235,227,0.4)';
        g.font = '800 11px system-ui, sans-serif';
        g.fillText('ROOM CHAT', cx + 20, 75);

        const msgs = [
          { u: 'Karim', m: 'الصوت والصورة خرافية 🔥', col: '#dc3044' },
          { u: 'Sarah', m: 'The soundtrack in 4K is insane!', col: '#d4af6a' },
          { u: 'Alex', m: 'Don’t forget the popcorn 🍿', col: '#3b82f6' },
          { u: 'Zaid', m: 'Perfect sync guys! 👌', col: '#10b981' },
        ];

        msgs.forEach((msg, mi) => {
          const my = 105 + mi * 68;
          g.fillStyle = msg.col;
          g.font = '700 13px system-ui, sans-serif';
          g.fillText(msg.u, cx + 20, my);

          g.fillStyle = '#f2ebe3';
          g.font = '500 13px system-ui, sans-serif';
          g.fillText(msg.m, cx + 20, my + 20);
        });

        // Chat Input box
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.roundRect ? g.roundRect(cx + 16, h - 56, 288, 40, 8) : g.rect(cx + 16, h - 56, 288, 40);
        g.fill();
        g.fillStyle = 'rgba(242,235,227,0.3)';
        g.font = '500 13px sans-serif';
        g.fillText('اكتب رسالة في الغرفة...', cx + 30, h - 31);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textures.push(tex);
      return tex;
    }

    /* ── bespoke 3D device assemblies ────────────────────────────────────── */

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

    // Helper: Material presets
    const titaniumMat = new THREE.MeshPhysicalMaterial({
      color: 0x110d10,
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
      envMapIntensity: 1.3,
    });

    const spaceGrayMat = new THREE.MeshPhysicalMaterial({
      color: 0x181417,
      metalness: 0.88,
      roughness: 0.28,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.1,
    });

    const screenGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      roughness: 0.05,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      depthWrite: false,
    });

    // 1. Samsung OLED Smart TV
    function createTv(position: [number, number, number], rotation: [number, number, number]) {
      const group = new THREE.Group();
      const w = 2.8;
      const h = 1.58;
      const depth = 0.032;

      // Ultra-thin OLED panel frame
      const panelGeo = new THREE.ExtrudeGeometry(roundedRect(w, h, 0.035), {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
        curveSegments: 8,
      });
      panelGeo.center();
      const panel = new THREE.Mesh(panelGeo, titaniumMat);
      group.add(panel);

      // Display Screen
      const screenMat = new THREE.MeshBasicMaterial({
        map: screenTexture('tv'),
        toneMapped: false,
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.965, h * 0.95), screenMat);
      screen.position.z = depth / 2 + 0.013;
      group.add(screen);

      // Reflective screen glass layer
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.965, h * 0.95), screenGlassMat);
      glass.position.z = depth / 2 + 0.014;
      group.add(glass);

      // Bottom bezel brushed metal chin + glowing LED pip
      const chin = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.965, 0.018),
        new THREE.MeshBasicMaterial({ color: 0xd4af6a, transparent: true, opacity: 0.7 }),
      );
      chin.position.set(0, -h * 0.475, depth / 2 + 0.014);
      group.add(chin);

      const led = new THREE.Mesh(
        new THREE.CircleGeometry(0.008, 16),
        new THREE.MeshBasicMaterial({ color: 0xdc3044 }),
      );
      led.position.set(0, -h * 0.475, depth / 2 + 0.015);
      group.add(led);

      // Rear electronics box
      const rearGeo = new THREE.ExtrudeGeometry(roundedRect(1.7, 0.9, 0.03), {
        depth: 0.05,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
      });
      rearGeo.center();
      const rear = new THREE.Mesh(rearGeo, titaniumMat);
      rear.position.set(0, -0.1, -depth / 2 - 0.025);
      group.add(rear);

      // TV Stand (Neck + Base Plate)
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.035), titaniumMat);
      stem.position.set(0, -h / 2 - 0.12, -0.01);
      group.add(stem);

      const basePlateGeo = new THREE.ExtrudeGeometry(roundedRect(1.15, 0.32, 0.04), {
        depth: 0.018,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.008,
      });
      basePlateGeo.center();
      const basePlate = new THREE.Mesh(basePlateGeo, titaniumMat);
      basePlate.rotation.x = Math.PI / 2;
      basePlate.position.set(0, -h / 2 - 0.28, 0.08);
      group.add(basePlate);

      group.position.set(...position);
      group.rotation.set(...rotation);
      root.add(group);

      slabs.push({
        group,
        screen: screenMat,
        base: new THREE.Vector3(...position),
        baseRot: new THREE.Euler(...rotation),
        id: 'tv',
        phase: 0,
      });
    }

    // 2. Android Smartphone Flagship
    function createPhone(position: [number, number, number], rotation: [number, number, number]) {
      const group = new THREE.Group();
      const w = 1.08;
      const h = 2.18;
      const depth = 0.055;
      const radius = 0.16;

      // Curved Titanium Chassis
      const chassisGeo = new THREE.ExtrudeGeometry(roundedRect(w, h, radius), {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 3,
        curveSegments: 12,
      });
      chassisGeo.center();
      const chassis = new THREE.Mesh(chassisGeo, titaniumMat);
      group.add(chassis);

      // OLED Screen
      const screenMat = new THREE.MeshBasicMaterial({
        map: screenTexture('phone'),
        toneMapped: false,
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.96), screenMat);
      screen.position.z = depth / 2 + 0.021;
      group.add(screen);

      // Screen Glass Sheen
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.96), screenGlassMat);
      glass.position.z = depth / 2 + 0.022;
      group.add(glass);

      // Gilt bottom accent
      const accent = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.94, 0.008),
        new THREE.MeshBasicMaterial({ color: 0xd4af6a, transparent: true, opacity: 0.6 }),
      );
      accent.position.set(0, -h * 0.48, depth / 2 + 0.022);
      group.add(accent);

      // Rear Camera Island
      const camPlateGeo = new THREE.ExtrudeGeometry(roundedRect(0.42, 0.46, 0.08), {
        depth: 0.025,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.006,
      });
      camPlateGeo.center();
      const camPlate = new THREE.Mesh(camPlateGeo, spaceGrayMat);
      camPlate.position.set(-w * 0.23, h * 0.32, -depth / 2 - 0.015);
      group.add(camPlate);

      // 3 Camera Lenses
      const lensPos: Array<[number, number]> = [
        [-w * 0.28, h * 0.38],
        [-w * 0.28, h * 0.26],
        [-w * 0.18, h * 0.32],
      ];
      lensPos.forEach(([lx, ly]) => {
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.012, 24),
          titaniumMat,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(lx, ly, -depth / 2 - 0.032);
        group.add(ring);

        const lensGlass = new THREE.Mesh(
          new THREE.CircleGeometry(0.04, 20),
          new THREE.MeshBasicMaterial({ color: 0x070607 }),
        );
        lensGlass.rotation.y = Math.PI;
        lensGlass.position.set(lx, ly, -depth / 2 - 0.039);
        group.add(lensGlass);
      });

      // Side keys
      const pwr = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.02), titaniumMat);
      pwr.position.set(w / 2 + 0.022, 0.2, 0);
      group.add(pwr);

      const vol = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.32, 0.02), titaniumMat);
      vol.position.set(-w / 2 - 0.022, 0.25, 0);
      group.add(vol);

      group.position.set(...position);
      group.rotation.set(...rotation);
      root.add(group);

      slabs.push({
        group,
        screen: screenMat,
        base: new THREE.Vector3(...position),
        baseRot: new THREE.Euler(...rotation),
        id: 'android',
        phase: 2.1,
      });
    }

    // 3. Discord Studio / Laptop (Lid + Keyboard Base)
    function createLaptop(position: [number, number, number], rotation: [number, number, number]) {
      const group = new THREE.Group();
      const lw = 1.9;
      const lh = 1.25;
      const ldepth = 0.03;

      // Screen Lid
      const lidGeo = new THREE.ExtrudeGeometry(roundedRect(lw, lh, 0.04), {
        depth: ldepth,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
      });
      lidGeo.center();
      const lid = new THREE.Mesh(lidGeo, spaceGrayMat);
      lid.position.set(0, lh * 0.45, 0);
      group.add(lid);

      // Screen
      const screenMat = new THREE.MeshBasicMaterial({
        map: screenTexture('tile'),
        toneMapped: false,
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(lw * 0.94, lh * 0.92), screenMat);
      screen.position.set(0, lh * 0.45, ldepth / 2 + 0.011);
      group.add(screen);

      // Screen Glass Sheen
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(lw * 0.94, lh * 0.92), screenGlassMat);
      glass.position.set(0, lh * 0.45, ldepth / 2 + 0.012);
      group.add(glass);

      // Keyboard Chassis Base (tilted at ~105 deg hinge)
      const baseGeo = new THREE.ExtrudeGeometry(roundedRect(lw, lh, 0.04), {
        depth: ldepth + 0.008,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
      });
      baseGeo.center();
      const baseChassis = new THREE.Mesh(baseGeo, spaceGrayMat);
      baseChassis.rotation.x = Math.PI / 2.3;
      baseChassis.position.set(0, -0.06, lh * 0.45);
      group.add(baseChassis);

      // Keyboard deck texture/plane
      const kbd = new THREE.Mesh(
        new THREE.PlaneGeometry(lw * 0.88, lh * 0.52),
        new THREE.MeshBasicMaterial({ color: 0x0c0a0c }),
      );
      kbd.rotation.x = -Math.PI / 2;
      kbd.position.set(0, 0.018, -lh * 0.12);
      baseChassis.add(kbd);

      // Trackpad
      const trackpad = new THREE.Mesh(
        new THREE.PlaneGeometry(lw * 0.36, lh * 0.32),
        new THREE.MeshBasicMaterial({ color: 0x1c171a }),
      );
      trackpad.rotation.x = -Math.PI / 2;
      trackpad.position.set(0, 0.018, lh * 0.32);
      baseChassis.add(trackpad);

      group.position.set(...position);
      group.rotation.set(...rotation);
      root.add(group);

      slabs.push({
        group,
        screen: screenMat,
        base: new THREE.Vector3(...position),
        baseRot: new THREE.Euler(...rotation),
        id: 'discord',
        phase: 4.2,
      });
    }

    // Assemble the constellation
    createTv([0.92, 0.62, -0.2], [0.03, -0.28, 0.02]);
    createPhone([-1.72, -0.12, 0.44], [0.05, 0.32, -0.05]);
    createLaptop([0.96, -1.18, 0.65], [0.08, -0.14, 0.03]);

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
