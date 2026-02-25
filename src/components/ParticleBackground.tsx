import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  vx: number;
  vy: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
}

const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const particles: Particle[] = [];
    const PARTICLE_COUNT = 80;
    const INTERACTION_RADIUS = 140;
    const mouse = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      lastMoveAt: 0,
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!mouse.lastMoveAt) {
        mouse.x = canvas.width / 2;
        mouse.y = canvas.height / 2;
        mouse.targetX = mouse.x;
        mouse.targetY = mouse.y;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const handlePointerMove = (event: PointerEvent) => {
      mouse.targetX = event.clientX;
      mouse.targetY = event.clientY;
      mouse.lastMoveAt = performance.now();
    };

    window.addEventListener("pointermove", handlePointerMove);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2.5 + 0.5,
        speedY: -(Math.random() * 0.4 + 0.1),
        speedX: (Math.random() - 0.5) * 0.3,
        vx: 0,
        vy: 0,
        opacity: Math.random() * 0.5 + 0.2,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.01,
      });
    }

    const draw = () => {
      const now = performance.now();
      const mouseActivity = Math.max(0, 1 - (now - mouse.lastMoveAt) / 1200);
      mouse.x += (mouse.targetX - mouse.x) * 0.12;
      mouse.y += (mouse.targetY - mouse.y) * 0.12;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (mouseActivity > 0.02) {
        const cursorGlow = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 120);
        cursorGlow.addColorStop(0, `hsla(0, 90%, 55%, ${0.06 * mouseActivity})`);
        cursorGlow.addColorStop(0.5, `hsla(0, 90%, 55%, ${0.025 * mouseActivity})`);
        cursorGlow.addColorStop(1, "hsla(0, 90%, 55%, 0)");
        ctx.fillStyle = cursorGlow;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 120, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of particles) {
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const distSq = mdx * mdx + mdy * mdy;
        if (mouseActivity > 0.02 && distSq < INTERACTION_RADIUS * INTERACTION_RADIUS) {
          const dist = Math.max(1, Math.sqrt(distSq));
          const proximity = 1 - dist / INTERACTION_RADIUS;
          const force = proximity * 0.07 * mouseActivity;
          p.vx += (mdx / dist) * force;
          p.vy += (mdy / dist) * force;
        }

        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.speedX + p.vx;
        p.y += p.speedY + p.vy;
        p.pulse += p.pulseSpeed;

        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
          p.vx = 0;
          p.vy = 0;
        }
        if (p.x < -10) {
          p.x = canvas.width + 10;
          p.vx = 0;
        }
        if (p.x > canvas.width + 10) {
          p.x = -10;
          p.vx = 0;
        }

        const mouseDist = Math.sqrt(distSq);
        const interactionBoost =
          mouseActivity > 0.02 && mouseDist < INTERACTION_RADIUS
            ? (1 - mouseDist / INTERACTION_RADIUS) * mouseActivity
            : 0;
        const currentOpacity =
          p.opacity * (0.6 + 0.4 * Math.sin(p.pulse)) + interactionBoost * 0.18;
        const glowRadius = p.size * (4 + interactionBoost * 2.4);
        const coreRadius = p.size * (1 + interactionBoost * 0.45);

        // Glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        gradient.addColorStop(0, `hsla(0, 85%, 50%, ${currentOpacity})`);
        gradient.addColorStop(0.4, `hsla(0, 85%, 50%, ${currentOpacity * (0.3 + interactionBoost * 0.25)})`);
        gradient.addColorStop(1, `hsla(0, 85%, 50%, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `hsla(0, 90%, 65%, ${currentOpacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, coreRadius, 0, Math.PI * 2);
        ctx.fill();

        if (interactionBoost > 0.12) {
          const trailAlpha = interactionBoost * 0.12;
          ctx.strokeStyle = `hsla(0, 90%, 55%, ${trailAlpha})`;
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      // Draw connecting lines between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const mouseDistA = Math.hypot(particles[i].x - mouse.x, particles[i].y - mouse.y);
            const mouseDistB = Math.hypot(particles[j].x - mouse.x, particles[j].y - mouse.y);
            const mouseBoost = Math.max(
              0,
              1 - Math.min(mouseDistA, mouseDistB) / INTERACTION_RADIUS,
            ) * mouseActivity;
            const alpha = (1 - dist / 120) * (0.12 + mouseBoost * 0.08);
            ctx.strokeStyle = `hsla(0, 85%, 50%, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  );
};

export default ParticleBackground;
