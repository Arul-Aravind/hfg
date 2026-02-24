import { Shield, Building2, Zap, Brain, Coins, BarChart3, Leaf, Server } from "lucide-react";
import { useEffect, useState } from "react";

const features = [
  { icon: Shield, title: "JWT Authentication", desc: "Secure admin login with role-based access and organization mapping" },
  { icon: Building2, title: "Multi-Block Architecture", desc: "Independent per-block streaming, baselines, and classification" },
  { icon: Zap, title: "Real-Time Intelligence", desc: "Continuous stream ingestion with sliding window analysis" },
  { icon: Brain, title: "Smart Classification", desc: "Context-aware categorization: Normal, Necessary, Possible Waste, Waste" },
  { icon: Coins, title: "Savings Engine", desc: "Real-time potential savings estimation per block and aggregate" },
  { icon: BarChart3, title: "Live Dashboard", desc: "Block status cards, waste heatmap, savings counter, streaming indicators" },
  { icon: Leaf, title: "Sustainability Metrics", desc: "CO₂ reduction estimates, efficiency scores, monthly forecasts" },
  { icon: Server, title: "Pathway Streaming", desc: "Deterministic streaming logic with scalable, production-ready computation" },
];

const FeaturesSection = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    const el = document.getElementById("features-section");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features-section" className="py-20 px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-orbitron text-3xl md:text-4xl font-bold neon-text mb-4">
            Full Feature Suite
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Not just graphs. We explain whether energy is necessary, quantify savings, and enable immediate action.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className={`glass-card gloss neon-border rounded-lg p-6 deep-shadow motion-blur hover:scale-[1.03] transition-all duration-500 group relative overflow-hidden ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-orbitron text-xs font-bold text-foreground mb-2 tracking-wide">{feat.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
