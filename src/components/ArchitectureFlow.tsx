import { useEffect, useState } from "react";
import { Database, Cpu, BarChart3, Monitor, Radio, GitBranch, Brain, Gauge } from "lucide-react";

const steps = [
  { icon: Radio, label: "Data Ingestion", desc: "Live energy, occupancy & temperature streams per block" },
  { icon: Cpu, label: "Pathway Engine", desc: "Real-time streaming table creation & continuous recomputation" },
  { icon: GitBranch, label: "Per-Block Grouping", desc: "Independent rolling baselines per block via sliding windows" },
  { icon: Gauge, label: "Deviation Analysis", desc: "Contextual deviation calculation with occupancy & temperature" },
  { icon: Brain, label: "Classification", desc: "NORMAL · NECESSARY · POSSIBLE_WASTE · WASTE" },
  { icon: Database, label: "Savings Engine", desc: "Real-time potential savings estimation per block" },
  { icon: BarChart3, label: "FastAPI", desc: "/dashboard/current-status endpoint with live data" },
  { icon: Monitor, label: "Admin Dashboard", desc: "Block-wise status, waste hotspots, sustainability metrics" },
];

const ArchitectureFlow = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    const el = document.getElementById("architecture-section");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="architecture-section" className="py-20 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-orbitron text-3xl md:text-4xl font-bold neon-text mb-4">
            System Architecture
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            End-to-end streaming pipeline from raw sensor data to actionable intelligence.
          </p>
        </div>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/0 via-primary/40 to-primary/0" />

          {steps.map((step, i) => {
            const Icon = step.icon;
            const isLeft = i % 2 === 0;
            return (
              <div
                key={step.label}
                className={`relative flex items-center mb-8 last:mb-0 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                {/* Desktop: alternating layout */}
                <div className={`hidden md:flex w-full items-center ${isLeft ? '' : 'flex-row-reverse'}`}>
                  <div className={`w-[calc(50%-2rem)] ${isLeft ? 'text-right pr-8' : 'text-left pl-8'}`}>
                    <h3 className="font-orbitron text-sm font-bold text-foreground">{step.label}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{step.desc}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg glass-card neon-border flex items-center justify-center z-10 animate-glow-pulse shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="w-[calc(50%-2rem)]" />
                </div>

                {/* Mobile */}
                <div className="md:hidden flex items-start gap-4 pl-0">
                  <div className="w-12 h-12 rounded-lg glass-card neon-border flex items-center justify-center z-10 shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-orbitron text-sm font-bold text-foreground">{step.label}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{step.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ArchitectureFlow;
