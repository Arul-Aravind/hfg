import { useEffect, useMemo, useState } from "react";
import { Thermometer, Users, Zap, TrendingDown } from "lucide-react";
import Sparkline from "@/components/Sparkline";

export type WasteClass = "NORMAL" | "NECESSARY" | "POSSIBLE_WASTE" | "WASTE";

export interface BlockHistoryPoint {
  ts: string;
  deviation_pct: number;
  energy_kwh: number;
  baseline_kwh: number;
}

export interface BlockData {
  id?: string;
  block: string;
  energy_kwh: number;
  baseline: number;
  occupancy: number;
  temperature: number;
  status: WasteClass;
  savings: number;
  deviation_pct?: number;
  tariff_inr_per_kwh?: number;
  cost_inr?: number;
  waste_cost_inr?: number;
  carbon_intensity_kg_per_kwh?: number;
  co2_kg?: number;
  root_cause?: string;
  forecast_peak_deviation?: number;
  forecast_waste_risk?: string;
  lstm_predicted_deviation_pct?: number;
  lstm_anomaly_probability?: number;
  lstm_risk?: string;
  lstm_avoidable_kwh?: number;
  lstm_confidence?: number;
  lstm_model_ready?: boolean;
  lstm_reason?: string;
  history?: BlockHistoryPoint[];
}

interface BlockStatusCardsProps {
  blocks?: BlockData[];
  title?: string;
  subtitle?: string;
  liveLabel?: string;
  showLiveIndicator?: boolean;
  totalSavingsOverride?: number;
  onBlockClick?: (block: BlockData) => void;
}

const generateHistory = (baseline: number, variance: number, seed: number): BlockHistoryPoint[] => {
  const now = Date.now();
  return Array.from({ length: 16 }, (_, i) => {
    const deviation = Math.sin(i / 2 + seed) * variance + variance / 3;
    const energy = baseline * (1 + deviation / 100);
    return {
      ts: new Date(now - (16 - i) * 15000).toISOString(),
      deviation_pct: Number(deviation.toFixed(1)),
      energy_kwh: Number(energy.toFixed(2)),
      baseline_kwh: baseline,
    };
  });
};

const mockBlocks: BlockData[] = [
  { block: "Block A — Admin", energy_kwh: 42.3, baseline: 38.5, occupancy: 85, temperature: 34, status: "NECESSARY", savings: 0, history: generateHistory(38.5, 10, 1) },
  { block: "Block B — CS Dept", energy_kwh: 55.1, baseline: 35.0, occupancy: 12, temperature: 26, status: "WASTE", savings: 20.1, history: generateHistory(35.0, 18, 2) },
  { block: "Block C — Library", energy_kwh: 30.2, baseline: 28.0, occupancy: 60, temperature: 30, status: "NORMAL", savings: 2.2, history: generateHistory(28.0, 6, 3) },
  { block: "Block D — Labs", energy_kwh: 48.7, baseline: 36.0, occupancy: 20, temperature: 33, status: "POSSIBLE_WASTE", savings: 12.7, history: generateHistory(36.0, 14, 4) },
  { block: "Block E — Hostel", energy_kwh: 25.4, baseline: 24.0, occupancy: 70, temperature: 29, status: "NORMAL", savings: 1.4, history: generateHistory(24.0, 5, 5) },
  { block: "Block F — Canteen", energy_kwh: 62.0, baseline: 34.0, occupancy: 8, temperature: 25, status: "WASTE", savings: 28.0, history: generateHistory(34.0, 20, 6) },
];

const statusConfig: Record<WasteClass, { label: string; className: string; borderClass: string }> = {
  NORMAL: { label: "NORMAL", className: "neon-text", borderClass: "neon-border" },
  NECESSARY: { label: "NECESSARY", className: "neon-text-green", borderClass: "neon-border-green" },
  POSSIBLE_WASTE: { label: "POSSIBLE WASTE", className: "neon-text-amber", borderClass: "neon-border-amber" },
  WASTE: { label: "WASTE", className: "neon-text-red", borderClass: "neon-border-red" },
};

const statusSparkline: Record<WasteClass, string> = {
  NORMAL: "hsl(var(--neon-green))",
  NECESSARY: "hsl(var(--primary))",
  POSSIBLE_WASTE: "hsl(var(--warning))",
  WASTE: "hsl(var(--neon-red))",
};

const BlockStatusCards = ({
  blocks,
  title = "Live Block Status",
  subtitle = "Real-time contextual classification for every building block. Each block maintains its own rolling baseline.",
  liveLabel = "LIVE — Streaming from Pathway",
  showLiveIndicator = true,
  totalSavingsOverride,
  onBlockClick,
}: BlockStatusCardsProps) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    const el = document.getElementById("blocks-section");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasLiveData = Boolean(blocks && blocks.length > 0);
  const rows = hasLiveData ? blocks! : blocks ? [] : mockBlocks;
  const totalSavings = useMemo(() => {
    if (typeof totalSavingsOverride === "number") return totalSavingsOverride;
    return rows.reduce((sum, b) => sum + b.savings, 0);
  }, [rows, totalSavingsOverride]);

  return (
    <section id="blocks-section" className="py-20 px-6 relative">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="font-orbitron text-3xl md:text-4xl font-bold neon-text mb-4">
            {title}
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Savings Banner */}
        <div className="glass-card neon-border-green rounded-lg p-6 mb-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-neon-green animate-pulse-neon" />
            <div>
              <p className="text-sm text-muted-foreground font-mono uppercase tracking-wider">Total Potential Savings</p>
              <p className="font-orbitron text-3xl font-bold neon-text-green">{totalSavings.toFixed(1)} kWh</p>
            </div>
          </div>
          {showLiveIndicator ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
              <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
              {liveLabel}
            </div>
          ) : null}
        </div>

        {/* Block Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.length === 0 ? (
            <div className="glass-card neon-border rounded-lg p-10 text-center text-muted-foreground font-mono col-span-full">
              Waiting for live block data...
            </div>
          ) : (
            rows.map((block, i) => {
              const cfg = statusConfig[block.status];
              const deviation = block.deviation_pct ?? ((block.energy_kwh - block.baseline) / block.baseline * 100);
              return (
                <div
                  key={`${block.block}-${i}`}
                  role={onBlockClick ? "button" : undefined}
                  tabIndex={onBlockClick ? 0 : undefined}
                  onClick={() => onBlockClick?.(block)}
                  onKeyDown={(event) => {
                    if (!onBlockClick) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onBlockClick(block);
                    }
                  }}
                  className={`glass-card gloss ${cfg.borderClass} rounded-lg p-6 deep-shadow motion-blur transition-all duration-500 hover:scale-[1.02] relative overflow-hidden ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${onBlockClick ? "cursor-pointer" : ""}`}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-orbitron text-sm font-semibold text-foreground tracking-wide">{block.block}</h3>
                    {block.forecast_waste_risk ? (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Forecast risk: {block.forecast_waste_risk}
                      </p>
                    ) : null}
                    {typeof block.lstm_anomaly_probability === "number" ? (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        LSTM: {block.lstm_risk ?? "LOW"} · {(block.lstm_anomaly_probability * 100).toFixed(0)}% anomaly probability
                      </p>
                    ) : null}
                  </div>
                  <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${cfg.className}`}>
                    {cfg.label}
                  </span>
                </div>

                {/* Energy bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground font-mono mb-1">
                    <span>Energy</span>
                    <span>{block.energy_kwh} kWh</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 bg-primary"
                      style={{ width: `${Math.min((block.energy_kwh / 70) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground font-mono mt-1">
                    <span>Baseline: {block.baseline} kWh</span>
                    <span className={Number(deviation) > 15 ? 'text-destructive' : 'text-primary'}>
                      +{Number(deviation).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Live Activity */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-2 uppercase tracking-wider">
                    <span>Live Activity (5m)</span>
                    <span>{block.history?.length ?? 0} pts</span>
                  </div>
                  <Sparkline
                    values={(block.history ?? []).map((point) => point.deviation_pct)}
                    stroke={statusSparkline[block.status]}
                    height={34}
                  />
                </div>

                {typeof block.lstm_avoidable_kwh === "number" ? (
                  <div className="mt-3 rounded border border-primary/20 bg-primary/10 p-2 text-[10px] font-mono text-muted-foreground">
                    Avoidable next-hour anomaly load: <span className="text-foreground">{block.lstm_avoidable_kwh.toFixed(2)} kWh</span>
                  </div>
                ) : null}

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 text-center mt-4">
                  <div className="rounded bg-muted/50 p-2">
                    <Users className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="font-mono text-xs text-muted-foreground">Occupancy</p>
                    <p className="font-orbitron text-sm font-bold text-foreground">{block.occupancy}%</p>
                  </div>
                  <div className="rounded bg-muted/50 p-2">
                    <Thermometer className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="font-mono text-xs text-muted-foreground">Temp</p>
                    <p className="font-orbitron text-sm font-bold text-foreground">{block.temperature}°C</p>
                  </div>
                  <div className="rounded bg-muted/50 p-2">
                    <Zap className="w-4 h-4 text-neon-green mx-auto mb-1" />
                    <p className="font-mono text-xs text-muted-foreground">Savings</p>
                    <p className="font-orbitron text-sm font-bold neon-text-green">{block.savings.toFixed(1)}</p>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};

export default BlockStatusCards;
