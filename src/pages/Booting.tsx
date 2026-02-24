import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ParticleBackground from "@/components/ParticleBackground";
import { getToken } from "@/lib/auth";

const Booting = () => {
  const navigate = useNavigate();
  const token = getToken();
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const start = Date.now();
    const totalMs = 2800;
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / totalMs) * 100));
      setProgress(pct);
    }, 60);

    const done = window.setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, totalMs + 80);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
  }, [navigate, token]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md scanline">
      <ParticleBackground />
      <div className="relative z-10 h-full w-full flex items-center justify-center px-6">
        <div className="w-full max-w-2xl glass-card neon-border rounded-2xl p-8 deep-shadow-red">
          <div className="relative mx-auto h-24 w-24 mb-5">
            <div className="absolute inset-0 techno-ring" />
            <div className="absolute inset-2 techno-ring-reverse" />
            <div className="absolute inset-7 rounded-full border border-primary/70 bg-primary/10 animate-pulse" />
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary/90 text-center">
            Admin Authenticated
          </p>
          <h2 className="font-orbitron text-4xl md:text-5xl font-bold neon-text text-center mt-2">
            Booting Energy Grid
          </h2>
          <p className="text-center text-muted-foreground mt-3 font-mono">
            Loading Pathway streams, baselines, and live intelligence.
          </p>

          <div className="mt-8 rounded-full h-3 bg-muted/70 border border-primary/30 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-warning to-neon-green transition-all duration-200 loader-stripes"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-right text-xs font-mono text-muted-foreground">{progress}%</div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 animate-pulse-neon">
              <p className="text-muted-foreground uppercase">Auth Layer</p>
              <p className="text-foreground mt-1">JWT Session Validated</p>
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 animate-glow-pulse">
              <p className="text-muted-foreground uppercase">Pathway Engine</p>
              <p className="text-foreground mt-1">Initializing Connectors</p>
            </div>
            <div className="rounded-lg border border-neon-green/30 bg-neon-green/10 p-3 animate-float">
              <p className="text-muted-foreground uppercase">Dashboard Bus</p>
              <p className="text-foreground mt-1">Preparing Live State</p>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-center gap-1.5 h-8">
            <span className="signal-bar" />
            <span className="signal-bar delay-1" />
            <span className="signal-bar delay-2" />
            <span className="signal-bar delay-3" />
            <span className="signal-bar delay-4" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Booting;
