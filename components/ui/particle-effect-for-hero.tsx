"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

interface BackgroundParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
}

interface MouseState {
  x: number;
  y: number;
  isActive: boolean;
}

const PARTICLE_DENSITY = 0.00012;
const BG_PARTICLE_DENSITY = 0.00004;
const MOUSE_RADIUS = 180;
const RETURN_SPEED = 0.08;
const DAMPING = 0.9;
const REPULSION_STRENGTH = 1.2;

const randomRange = (min: number, max: number) =>
  Math.random() * (max - min) + min;

const AntiGravityCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [debugInfo, setDebugInfo] = useState({ count: 0, fps: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const backgroundParticlesRef = useRef<BackgroundParticle[]>([]);
  const mouseRef = useRef<MouseState>({ x: -1000, y: -1000, isActive: false });
  const frameIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const initParticles = useCallback((width: number, height: number) => {
    const particleCount = Math.floor(width * height * PARTICLE_DENSITY);
    const newParticles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      newParticles.push({
        x,
        y,
        originX: x,
        originY: y,
        vx: 0,
        vy: 0,
        size: randomRange(1, 2.2),
        color:
          Math.random() > 0.75
            ? "#f9a8d4"
            : Math.random() > 0.5
            ? "#fbcfe8"
            : "#ffffff",
      });
    }
    particlesRef.current = newParticles;

    const bgCount = Math.floor(width * height * BG_PARTICLE_DENSITY);
    const newBgParticles: BackgroundParticle[] = [];
    for (let i = 0; i < bgCount; i++) {
      newBgParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        size: randomRange(0.5, 1.5),
        alpha: randomRange(0.1, 0.4),
        phase: Math.random() * Math.PI * 2,
      });
    }
    backgroundParticlesRef.current = newBgParticles;
    setDebugInfo((prev) => ({ ...prev, count: particleCount + bgCount }));
  }, []);

  const animate = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const delta = time - lastTimeRef.current;
    lastTimeRef.current = time;
    if (delta > 0) {
      setDebugInfo((prev) => ({ ...prev, fps: Math.round(1000 / delta) }));
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const pulseOpacity = Math.sin(time * 0.0008) * 0.04 + 0.07;
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, Math.max(canvas.width, canvas.height) * 0.65
    );
    gradient.addColorStop(0, `rgba(249, 168, 212, ${pulseOpacity})`);
    gradient.addColorStop(0.5, `rgba(249, 168, 212, ${pulseOpacity * 0.3})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgParticles = backgroundParticlesRef.current;
    ctx.fillStyle = "#f9a8d4";
    for (let i = 0; i < bgParticles.length; i++) {
      const p = bgParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      const twinkle = Math.sin(time * 0.002 + p.phase) * 0.5 + 0.5;
      ctx.globalAlpha = p.alpha * (0.3 + 0.7 * twinkle);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const particles = particlesRef.current;
    const mouse = mouseRef.current;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (mouse.isActive && distance < MOUSE_RADIUS && distance > 0.01) {
        const force = (MOUSE_RADIUS - distance) / MOUSE_RADIUS;
        p.vx -= (dx / distance) * force * REPULSION_STRENGTH * 5;
        p.vy -= (dy / distance) * force * REPULSION_STRENGTH * 5;
      }
      p.vx += (p.originX - p.x) * RETURN_SPEED;
      p.vy += (p.originY - p.y) * RETURN_SPEED;
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;

      const velocity = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const opacity = Math.min(0.25 + velocity * 0.12, 1);

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      if (p.color === "#f9a8d4") {
        ctx.fillStyle = `rgba(249,168,212,${opacity})`;
      } else if (p.color === "#fbcfe8") {
        ctx.fillStyle = `rgba(251,207,232,${opacity})`;
      } else {
        ctx.fillStyle = `rgba(255,255,255,${opacity})`;
      }
      ctx.fill();
    }

    frameIdRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasRef.current.width = width * dpr;
      canvasRef.current.height = height * dpr;
      canvasRef.current.style.width = `${width}px`;
      canvasRef.current.style.height = `${height}px`;
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      initParticles(width, height);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [initParticles]);

  useEffect(() => {
    frameIdRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [animate]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      isActive: true,
    };
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 overflow-hidden bg-black cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mouseRef.current.isActive = false; }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute bottom-4 right-4 pointer-events-none text-xs text-white/10 font-mono text-right">
        <p>{debugInfo.count} entities</p>
        <p>{debugInfo.fps} FPS</p>
      </div>
    </div>
  );
};

export default AntiGravityCanvas;
