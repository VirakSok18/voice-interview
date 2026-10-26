import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

// 3D Simplex Noise implementation for silky GPU/CPU fluid displacement
// Based on Stefan Gustavson's classic simplex noise
function createNoise3D() {
  const F3 = 1.0 / 3.0;
  const G3 = 1.0 / 6.0;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = (perm[i] % 12);
  }
  const grad3 = new Float32Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1
  ]);

  return function noise3D(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1, j1, k1;
    let i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0.0;
    else {
      const gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0 + grad3[gi0 + 2] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0.0;
    else {
      const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1 + grad3[gi1 + 2] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0.0;
    else {
      const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2 + grad3[gi2 + 2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0.0;
    else {
      const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (grad3[gi3] * x3 + grad3[gi3 + 1] * y3 + grad3[gi3 + 2] * z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  };
}

export default function VoiceOrb({ status = 'idle', audioLevel = 0 }) {
  const mountRef = useRef(null);
  const audioLevelRef = useRef(audioLevel);
  const statusRef = useRef(status);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const noise3D = createNoise3D();

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.08);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.z = 6.2;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Group for mouse parallax tilt
    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    // 1. Wireframe Orb (Toned down luxury colors: muted violet-indigo + deep slate)
    // 64 segments creates delicate, clean topological latitude & longitude lines
    const sphereRadius = 1.95;
    const geometry = new THREE.SphereGeometry(sphereRadius, 54, 54);
    
    // Preserve original positions for displacement
    const originalPositions = Float32Array.from(geometry.attributes.position.array);

    // Wireframe Material with subtle opacity & muted palette
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x6366f1, // Muted Indigo/Violet
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });

    const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
    orbGroup.add(wireframeMesh);

    // 2. Secondary Inner Translucent Dark Core
    const innerGeometry = new THREE.SphereGeometry(sphereRadius * 0.94, 32, 32);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0x0f172a, // Deep slate obsidian
      transparent: true,
      opacity: 0.65,
    });
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    orbGroup.add(innerMesh);

    // 3. Subtle Contour Accent Line (Ice Cyan / Soft Silver)
    const accentMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Soft Ice Cyan
      wireframe: true,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending
    });
    const accentMesh = new THREE.Mesh(geometry.clone(), accentMaterial);
    accentMesh.scale.setScalar(1.02);
    orbGroup.add(accentMesh);

    // 4. Ambient Halo Particle Cloud
    const particleCount = 280;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleOriginals = [];
    const particleScales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Golden spiral distribution on sphere with radius variation
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = sphereRadius * (1.15 + Math.random() * 0.6);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = z;

      particleOriginals.push({ x, y, z, r, speed: 0.2 + Math.random() * 0.5 });
      particleScales[i] = 1.0;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    // Particle sprite using canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(240, 246, 255, 0.9)');
    grad.addColorStop(0.3, 'rgba(99, 102, 241, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    const particleTexture = new THREE.CanvasTexture(canvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.08,
      map: particleTexture,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    orbGroup.add(particles);

    // Interactive mouse parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX = x * 0.8;
      mouseY = y * 0.8;
    };

    window.addEventListener('pointermove', onPointerMove);

    // Responsive Resize Handler
    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Dynamic scale adaptation based on screen width
      if (width < 640) {
        orbGroup.scale.setScalar(0.95);
      } else {
        orbGroup.scale.setScalar(1.08);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();
    let smoothAudio = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const time = clock.getElapsedTime();
      const currentStatus = statusRef.current;
      const currentAudio = audioLevelRef.current;

      // Smooth audio interpolation (Apple fluid damping)
      smoothAudio += (currentAudio - smoothAudio) * 0.18;

      // Mouse Parallax easing
      targetRotationY += (mouseX - targetRotationY) * 0.05;
      targetRotationX += (mouseY - targetRotationX) * 0.05;

      // Group rotation
      orbGroup.rotation.y = time * 0.12 + targetRotationY;
      orbGroup.rotation.x = Math.sin(time * 0.08) * 0.1 + targetRotationX;

      // Dynamic Wireframe Mesh vertex displacement
      const positionAttr = geometry.attributes.position;
      const posArray = positionAttr.array;
      const len = posArray.length;

      // Keep the sphere smooth & intact like idle, and gently pop/scale when capturing voice or talking
      let noiseSpeed = 0.4;
      let noiseScale = 0.65;
      let displacementStrength = 0.05 + smoothAudio * 0.09; // Gentle organic ripple, never breaks apart
      let voicePopScale = 1.0 + smoothAudio * 0.16; // Gently pops bigger when voice is active

      if (currentStatus === 'speaking') {
        noiseSpeed = 0.65;
        displacementStrength = 0.06 + smoothAudio * 0.1;
        voicePopScale = 1.03 + smoothAudio * 0.18;
        wireframeMaterial.color.setHex(0x6366f1); // Indigo
        accentMaterial.color.setHex(0x38bdf8); // Cyan
        wireframeMaterial.opacity = 0.38 + smoothAudio * 0.22;
      } else if (currentStatus === 'listening') {
        noiseSpeed = 0.5;
        displacementStrength = 0.05 + smoothAudio * 0.1;
        voicePopScale = 1.0 + smoothAudio * 0.18;
        wireframeMaterial.color.setHex(0x38bdf8); // Ice Cyan
        accentMaterial.color.setHex(0x818cf8);
        wireframeMaterial.opacity = 0.36 + smoothAudio * 0.25;
      } else if (currentStatus === 'thinking') {
        noiseSpeed = 0.7;
        displacementStrength = 0.06;
        voicePopScale = 1.02 + Math.sin(time * 3.5) * 0.03;
        wireframeMaterial.color.setHex(0x818cf8);
        accentMaterial.color.setHex(0xc084fc);
        wireframeMaterial.opacity = 0.42;
      } else if (currentStatus === 'interrupted') {
        displacementStrength = 0.08;
        noiseSpeed = 0.8;
        voicePopScale = 1.05;
        wireframeMaterial.color.setHex(0xf43f5e);
        wireframeMaterial.opacity = 0.48;
      } else {
        // Idle: Calm, meditative organic breathing
        noiseSpeed = 0.4;
        displacementStrength = 0.05;
        voicePopScale = 1.0;
        wireframeMaterial.color.setHex(0x4f46e5);
        accentMaterial.color.setHex(0x38bdf8);
        wireframeMaterial.opacity = 0.32;
      }

      wireframeMesh.scale.setScalar(voicePopScale);
      innerMesh.scale.setScalar(voicePopScale * 0.94);
      accentMesh.scale.setScalar(voicePopScale * 1.02);

      for (let i = 0; i < len; i += 3) {
        const ox = originalPositions[i];
        const oy = originalPositions[i + 1];
        const oz = originalPositions[i + 2];

        // 3D Simplex noise value
        const n = noise3D(
          ox * noiseScale + time * noiseSpeed,
          oy * noiseScale + time * noiseSpeed,
          oz * noiseScale + time * noiseSpeed
        );

        // Displace radially from center
        const factor = 1 + n * displacementStrength;
        posArray[i] = ox * factor;
        posArray[i + 1] = oy * factor;
        posArray[i + 2] = oz * factor;
      }
      positionAttr.needsUpdate = true;

      // Update secondary accent mesh positions
      accentMesh.geometry.attributes.position.copy(positionAttr);
      accentMesh.geometry.attributes.position.needsUpdate = true;

      // Particles orbit and pulse
      const pAttr = particleGeometry.attributes.position;
      const pArray = pAttr.array;
      const pLen = particleOriginals.length;

      for (let i = 0; i < pLen; i++) {
        const orig = particleOriginals[i];
        const angle = time * orig.speed * 0.2;
        const currentR = orig.r * (1 + smoothAudio * 0.14);

        // Gentle orbital wobble
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const px = orig.x * cosA - orig.z * sinA;
        const pz = orig.x * sinA + orig.z * cosA;

        pArray[i * 3] = px * (currentR / orig.r);
        pArray[i * 3 + 1] = orig.y * (currentR / orig.r) + Math.sin(time + orig.x) * 0.05;
        pArray[i * 3 + 2] = pz * (currentR / orig.r);
      }
      pAttr.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      wireframeMaterial.dispose();
      innerGeometry.dispose();
      innerMaterial.dispose();
      accentMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing select-none"
      style={{ touchAction: 'none' }}
    />
  );
}
