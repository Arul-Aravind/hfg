import { useEffect, useState } from "react";
import heroBg from "@/assets/hero-bg.jpg";
import { Zap, Activity, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const stats = [
  { label: "Blocks Monitored", value: 12, suffix: "", icon: Activity },
  { label: "Energy Saved", value: 34.7, suffix: "%", icon: TrendingDown },
  { label: "Live Streams", value: 48, suffix: "+", icon: Zap },
];

const AnimatedCounter = ({ target, suffix }: { target: number; suffix: string }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Number(current.toFixed(1)));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <span className="font-orbitron text-4xl md:text-5xl font-bold neon-text">
      {count % 1 === 0 ? Math.floor(count) : count}{suffix}
    </span>
  );
};

const HeroSection = () => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={heroBg} alt="" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
        <div className="absolute inset-0 grid-bg" />
      </div>

      {/* Scanline overlay */}
      <div className="absolute inset-0 scanline pointer-events-none" />

      {/* Top Navigation */}
      <div className="absolute top-6 left-0 right-0 z-20">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="font-orbitron text-lg neon-text tracking-widest">EnergySense</div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" className="border-primary/40">
              <Link to="/dashboard">Live Dashboard</Link>
            </Button>
            <Button asChild className="shadow-lg">
              <Link to="/login">Admin Login</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`relative z-10 max-w-6xl mx-auto px-6 text-center transition-all duration-1000 ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full neon-border mb-8 animate-glow-pulse">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse-neon" />
          <span className="text-sm font-mono tracking-widest text-primary uppercase">Presented by Team ByteFlow</span>
        </div>

        <h1 className="font-orbitron text-4xl sm:text-5xl md:text-7xl font-black leading-tight tracking-tight mb-6">
          <span className="text-foreground">Real-Time Energy</span>
          <br />
          <span className="neon-text">Intelligence System</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 font-rajdhani leading-relaxed">
          Transforming passive energy monitoring into proactive sustainability intelligence.
          Context-aware waste detection across every block — in real time.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card gloss rounded-lg p-6 neon-border deep-shadow-red motion-blur hover:scale-105 transition-transform duration-300 relative overflow-hidden">
              <stat.icon className="w-6 h-6 text-primary mx-auto mb-3 animate-pulse-neon" />
              <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              <p className="text-muted-foreground text-sm mt-2 font-mono tracking-wide uppercase">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="mt-16 animate-float">
          <div className="w-6 h-10 rounded-full border-2 border-primary/30 mx-auto flex items-start justify-center p-1">
            <div className="w-1.5 h-3 rounded-full bg-primary animate-pulse-neon" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
