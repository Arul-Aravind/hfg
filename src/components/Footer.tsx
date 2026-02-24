import { Zap } from "lucide-react";

const Footer = () => (
  <footer className="py-10 px-6 border-t border-border/30">
    <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        <span className="font-orbitron text-sm font-bold neon-text">EnergyIQ</span>
      </div>
      <p className="text-xs text-muted-foreground font-mono">
        Real-Time Multi-Block Energy Intelligence · Powered by Pathway
      </p>
    </div>
  </footer>
);

export default Footer;
