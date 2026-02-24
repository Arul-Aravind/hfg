import { AlertTriangle, Brain, Thermometer, TrendingDown, Users, Zap } from "lucide-react";
import Sparkline from "@/components/Sparkline";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BlockData } from "@/components/BlockStatusCards";

interface BlockDetailModalProps {
  block: BlockData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusTone: Record<string, string> = {
  NORMAL: "text-neon-green",
  NECESSARY: "text-primary",
  POSSIBLE_WASTE: "text-warning",
  WASTE: "text-destructive",
};

const statusStroke: Record<string, string> = {
  NORMAL: "hsl(var(--neon-green))",
  NECESSARY: "hsl(var(--primary))",
  POSSIBLE_WASTE: "hsl(var(--warning))",
  WASTE: "hsl(var(--neon-red))",
};

const BlockDetailModal = ({ block, open, onOpenChange }: BlockDetailModalProps) => {
  if (!block) return null;

  const history = block.history ?? [];
  const deviationValues = history.map((point) => point.deviation_pct);
  const latestPoints = history.slice(-6).reverse();
  const avgDeviation = deviationValues.length
    ? deviationValues.reduce((sum, val) => sum + val, 0) / deviationValues.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-orbitron text-2xl neon-text">
            {block.block}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card neon-border rounded-lg p-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Status</p>
            <p className={`mt-2 text-lg font-bold ${statusTone[block.status]}`}>{block.status.replace("_", " ")}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <AlertTriangle className="w-4 h-4" />
              Latest deviation: {block.deviation_pct?.toFixed(1) ?? "--"}%
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Forecast risk: <span className="text-foreground">{block.forecast_waste_risk ?? "LOW"}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Forecast peak: {block.forecast_peak_deviation?.toFixed(1) ?? "--"}%
            </div>
          </div>
          <div className="glass-card neon-border rounded-lg p-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Energy</p>
            <p className="mt-2 text-lg font-bold text-foreground">{block.energy_kwh.toFixed(1)} kWh</p>
            <p className="text-xs text-muted-foreground mt-1">Baseline: {block.baseline.toFixed(1)} kWh</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tariff: ₹{block.tariff_inr_per_kwh?.toFixed(2) ?? "--"} · Cost: ₹{block.cost_inr?.toFixed(1) ?? "--"}
            </p>
          </div>
          <div className="glass-card neon-border rounded-lg p-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Savings</p>
            <p className="mt-2 text-lg font-bold neon-text-green">{block.savings.toFixed(1)} kWh</p>
            <div className="text-xs text-muted-foreground mt-1">Avg deviation: {avgDeviation.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Waste cost: ₹{block.waste_cost_inr?.toFixed(1) ?? "--"}</div>
          </div>
        </div>

        <div className="glass-card neon-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono uppercase tracking-wider">
            <Brain className="w-4 h-4 text-primary" />
            LSTM Predictive Anomaly Intelligence
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="rounded border border-primary/20 bg-primary/10 p-2">
              <div className="text-muted-foreground">Risk</div>
              <div className="text-foreground mt-1">{block.lstm_risk ?? "LOW"}</div>
            </div>
            <div className="rounded border border-primary/20 bg-primary/10 p-2">
              <div className="text-muted-foreground">Anomaly Prob.</div>
              <div className="text-foreground mt-1">
                {typeof block.lstm_anomaly_probability === "number"
                  ? `${(block.lstm_anomaly_probability * 100).toFixed(0)}%`
                  : "--"}
              </div>
            </div>
            <div className="rounded border border-primary/20 bg-primary/10 p-2">
              <div className="text-muted-foreground">Predicted Dev.</div>
              <div className="text-foreground mt-1">
                {typeof block.lstm_predicted_deviation_pct === "number"
                  ? `${block.lstm_predicted_deviation_pct.toFixed(1)}%`
                  : "--"}
              </div>
            </div>
            <div className="rounded border border-primary/20 bg-primary/10 p-2">
              <div className="text-muted-foreground">Avoidable (1h)</div>
              <div className="text-foreground mt-1">
                {typeof block.lstm_avoidable_kwh === "number" ? `${block.lstm_avoidable_kwh.toFixed(2)} kWh` : "--"}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3">
            {block.lstm_reason ?? "Model warming up."}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card neon-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-4 h-4 text-primary" />
              Occupancy
            </div>
            <div className="mt-2 text-lg font-bold text-foreground">{block.occupancy}%</div>
          </div>
          <div className="glass-card neon-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Thermometer className="w-4 h-4 text-primary" />
              Temperature
            </div>
            <div className="mt-2 text-lg font-bold text-foreground">{block.temperature}°C</div>
          </div>
          <div className="glass-card neon-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="w-4 h-4 text-neon-green" />
              Current Savings Rate
            </div>
            <div className="mt-2 text-lg font-bold text-foreground">{block.savings.toFixed(1)} kWh</div>
            <div className="text-xs text-muted-foreground mt-1">CO₂: {block.co2_kg?.toFixed(2) ?? "--"} kg</div>
          </div>
        </div>

        {block.root_cause ? (
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">Root cause:</strong> {block.root_cause}
          </div>
        ) : null}

        <div className="glass-card neon-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-orbitron text-lg font-bold neon-text">Deviation (Last 5 Minutes)</h3>
            <TrendingDown className="w-4 h-4 text-primary" />
          </div>
          <Sparkline values={deviationValues} height={70} stroke={statusStroke[block.status] ?? "hsl(var(--primary))"} />
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono text-muted-foreground">
            {latestPoints.length === 0 ? (
              <div>No recent activity yet.</div>
            ) : (
              latestPoints.map((point) => (
                <div key={point.ts} className="rounded border border-primary/20 bg-muted/40 p-2">
                  <div>{new Date(point.ts).toLocaleTimeString()}</div>
                  <div>Deviation: {point.deviation_pct.toFixed(1)}%</div>
                  <div>Energy: {point.energy_kwh.toFixed(1)} kWh</div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BlockDetailModal;
