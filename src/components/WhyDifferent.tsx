import { ArrowRight } from "lucide-react";

const comparisons = [
  { traditional: "Show energy graphs", ours: "Explain whether energy is necessary" },
  { traditional: "Monthly bill surprises", ours: "Real-time waste detection" },
  { traditional: "Building-level data only", ours: "Block-level granular intelligence" },
  { traditional: "No actionable insights", ours: "Immediate corrective actions" },
  { traditional: "Static batch processing", ours: "Pathway streaming computation" },
];

const WhyDifferent = () => {
  return (
    <section className="py-20 px-6 relative">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-orbitron text-3xl md:text-4xl font-bold neon-text mb-4">
            Why This Is Different
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            We don't just show dashboards. We deliver proactive sustainability intelligence.
          </p>
        </div>

        <div className="space-y-4">
          {comparisons.map((c, i) => (
            <div key={i} className="glass-card neon-border rounded-lg p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-right">
                <span className="text-muted-foreground line-through font-mono text-sm">{c.traditional}</span>
              </div>
              <ArrowRight className="w-5 h-5 text-primary shrink-0 animate-pulse-neon" />
              <div className="flex-1 text-center sm:text-left">
                <span className="text-foreground font-semibold font-rajdhani">{c.ours}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Impact badges */}
        <div className="flex flex-wrap justify-center gap-4 mt-12">
          {["Climate Action", "Sustainable Campuses", "AI-Led Optimization", "Green Bharat"].map((tag) => (
            <span key={tag} className="px-4 py-2 rounded-full neon-border font-mono text-xs text-primary tracking-wider uppercase animate-glow-pulse">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyDifferent;
