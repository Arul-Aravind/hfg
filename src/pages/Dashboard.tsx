import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Brain,
  Bot,
  CheckCircle2,
  CloudSun,
  Gauge,
  Info,
  Leaf,
  LogOut,
  PlayCircle,
  Radar,
  TrendingDown,
  Zap,
} from "lucide-react";
import BlockStatusCards, { BlockData } from "@/components/BlockStatusCards";
import ParticleBackground from "@/components/ParticleBackground";
import BlockDetailModal from "@/components/BlockDetailModal";
import { Button } from "@/components/ui/button";
import { clearToken, getToken } from "@/lib/auth";
import { useDashboardStream } from "@/hooks/useDashboardStream";
import { AdrSummary, DashboardSnapshot, DemandResponseAction } from "@/types/dashboard";
import {
  acknowledgeAlert,
  askCopilot,
  executeAction as executeAdrActionApi,
  fetchActions,
  fetchAlerts,
  fetchReports,
  proposeAction as proposeAdrActionApi,
  resolveAction as resolveAdrActionApi,
  resolveAlert,
  verifyAction as verifyAdrActionApi,
} from "@/lib/api";
import { Input } from "@/components/ui/input";

const statusStyles: Record<string, string> = {
  NORMAL: "bg-neon-green/15 border-neon-green/40",
  NECESSARY: "bg-primary/20 border-primary/50",
  POSSIBLE_WASTE: "bg-warning/20 border-warning/60",
  WASTE: "bg-destructive/20 border-destructive/60",
};

const adrStatusStyles: Record<string, string> = {
  PROPOSED: "bg-primary/20 border-primary/40 text-primary",
  EXECUTED: "bg-warning/20 border-warning/50 text-warning",
  VERIFIED: "bg-neon-green/15 border-neon-green/40 text-neon-green",
  RESOLVED: "bg-muted/30 border-muted/50 text-muted-foreground",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const token = getToken();
  const { data, status, lastMessageAt } = useDashboardStream(token);
  const [fallback, setFallback] = useState<DashboardSnapshot | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copilotQuestion, setCopilotQuestion] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [copilotCitations, setCopilotCitations] = useState<{ source: string; snippet: string }[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [actions, setActions] = useState<DemandResponseAction[]>([]);
  const [adrSummary, setAdrSummary] = useState<AdrSummary | null>(null);

  useEffect(() => {
    if (!token) {
      navigate("/login");
    }
  }, [token, navigate]);

  useEffect(() => {
    if (data) {
      setFallback(data);
      if (data.actions) setActions(data.actions);
      if (data.adr_summary) setAdrSummary(data.adr_summary);
    }
  }, [data]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const alertRes = await fetchAlerts(token);
        setAlerts(alertRes.alerts ?? []);
        const reportRes = await fetchReports(token);
        setReports(reportRes.reports ?? []);
        const actionRes = await fetchActions(token);
        setActions(actionRes.actions ?? []);
        setAdrSummary(actionRes.summary ?? null);
      } catch {
        // ignore
      }
    };
    load();
    const id = window.setInterval(load, 10000);
    return () => window.clearInterval(id);
  }, [token]);

  const snapshot = data ?? fallback;
  const pathwayState = snapshot?.pathway_state;
  const effectiveActions = actions.length > 0 ? actions : (snapshot?.actions ?? []);
  const effectiveAdrSummary = adrSummary ?? snapshot?.adr_summary ?? null;
  const liveFromEvents = status === "live" && lastMessageAt !== null && Date.now() - lastMessageAt < 6000;
  const waitingForData = !snapshot || pathwayState?.stream_status === "WAITING_FOR_DATA" || snapshot.blocks.length === 0;
  const isLive = liveFromEvents && !waitingForData;
  const streamLabel = waitingForData ? "WAITING FOR DATA" : isLive ? "LIVE STREAM" : "RECONNECTING";
  const streamDotClass = waitingForData || !isLive ? "bg-warning" : "bg-neon-green";
  const baselineTooltip = pathwayState?.baseline_example
    ? `Baseline sample: ${pathwayState.baseline_example.block_label} (${pathwayState.baseline_example.block_id}) = ${pathwayState.baseline_example.baseline_kwh.toFixed(2)} kWh`
    : "Baseline sample will appear once block baselines are validated.";

  const blocks = useMemo<BlockData[]>(() => {
    if (!snapshot) return [];
    return snapshot.blocks.map((block) => ({
      id: block.block_id,
      block: block.block_label,
      energy_kwh: block.energy_kwh,
      baseline: block.baseline_kwh,
      occupancy: Math.round(block.occupancy),
      temperature: block.temperature,
      status: block.status,
      savings: block.savings_kwh,
      deviation_pct: block.deviation_pct,
      tariff_inr_per_kwh: block.tariff_inr_per_kwh,
      cost_inr: block.cost_inr,
      waste_cost_inr: block.waste_cost_inr,
      carbon_intensity_kg_per_kwh: block.carbon_intensity_kg_per_kwh,
      co2_kg: block.co2_kg,
      root_cause: block.root_cause,
      forecast_peak_deviation: block.forecast_peak_deviation,
      forecast_waste_risk: block.forecast_waste_risk,
      lstm_predicted_deviation_pct: block.lstm_predicted_deviation_pct,
      lstm_anomaly_probability: block.lstm_anomaly_probability,
      lstm_risk: block.lstm_risk,
      lstm_avoidable_kwh: block.lstm_avoidable_kwh,
      lstm_confidence: block.lstm_confidence,
      lstm_model_ready: block.lstm_model_ready,
      lstm_reason: block.lstm_reason,
      history: block.history ?? [],
    }));
  }, [snapshot]);

  const hotspots = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.blocks.filter((block) => block.status === "WASTE" || block.status === "POSSIBLE_WASTE");
  }, [snapshot]);

  const predictiveHotspots = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.blocks]
      .filter((block) => (block.lstm_risk === "HIGH" || block.lstm_risk === "MEDIUM"))
      .sort((a, b) => (b.lstm_avoidable_kwh ?? 0) - (a.lstm_avoidable_kwh ?? 0))
      .slice(0, 4);
  }, [snapshot]);

  const blockMap = useMemo(() => {
    const map = new Map<string, BlockData>();
    blocks.forEach((block) => {
      if (block.id) map.set(block.id, block);
    });
    return map;
  }, [blocks]);

  const handleLogout = () => {
    clearToken();
    navigate("/login");
  };

  const handleExportCsv = () => {
    if (!snapshot) return;
    const lines: string[] = [];
    lines.push(`Org,${snapshot.org.name}`);
    lines.push(`Generated At,${snapshot.generated_at}`);
    lines.push("");
    lines.push("Block ID,Block,Status,Energy kWh,Baseline kWh,Deviation %,Occupancy %,Temperature C,Savings kWh,Cost INR,Waste Cost INR,CO2 kg,LSTM Risk,LSTM Anomaly %,LSTM Avoidable kWh,LSTM Predicted Dev %,Updated At");
    snapshot.blocks.forEach((block) => {
      lines.push(
        [
          block.block_id,
          block.block_label,
          block.status,
          block.energy_kwh.toFixed(2),
          block.baseline_kwh.toFixed(2),
          block.deviation_pct.toFixed(1),
          block.occupancy.toFixed(1),
          block.temperature.toFixed(1),
          block.savings_kwh.toFixed(2),
          block.cost_inr.toFixed(2),
          block.waste_cost_inr.toFixed(2),
          block.co2_kg.toFixed(2),
          block.lstm_risk ?? "LOW",
          ((block.lstm_anomaly_probability ?? 0) * 100).toFixed(1),
          (block.lstm_avoidable_kwh ?? 0).toFixed(2),
          (block.lstm_predicted_deviation_pct ?? 0).toFixed(1),
          block.updated_at,
        ].join(","),
      );
    });
    lines.push("");
    lines.push("Totals");
    lines.push(`Total Energy (kWh),${snapshot.totals.total_energy_kwh.toFixed(2)}`);
    lines.push(`Total Savings (kWh),${snapshot.totals.total_savings_kwh.toFixed(2)}`);
    lines.push(`CO2 Reduction (kg),${snapshot.totals.co2_kg.toFixed(2)}`);
    lines.push(`Total Cost (INR),${snapshot.totals.total_cost_inr.toFixed(2)}`);
    lines.push(`Total Waste Cost (INR),${snapshot.totals.total_waste_cost_inr.toFixed(2)}`);
    lines.push(`Efficiency Score,${snapshot.totals.efficiency_score.toFixed(1)}`);
    lines.push(`Monthly Avoided (kWh),${snapshot.totals.monthly_avoided_kwh.toFixed(1)}`);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `energysense_snapshot_${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopilotAsk = async () => {
    if (!token || !copilotQuestion.trim()) return;
    try {
      const res = await askCopilot(token, copilotQuestion.trim());
      setCopilotAnswer(res.answer);
      setCopilotCitations(res.citations ?? []);
    } catch {
      setCopilotAnswer("Copilot is unavailable. Check backend configuration.");
      setCopilotCitations([]);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    if (!token) return;
    await acknowledgeAlert(token, alertId);
    const res = await fetchAlerts(token);
    setAlerts(res.alerts ?? []);
  };

  const handleResolve = async (alertId: string) => {
    if (!token) return;
    await resolveAlert(token, alertId);
    const res = await fetchAlerts(token);
    setAlerts(res.alerts ?? []);
  };

  const refreshAdr = async () => {
    if (!token) return;
    const actionRes = await fetchActions(token);
    setActions(actionRes.actions ?? []);
    setAdrSummary(actionRes.summary ?? null);
  };

  const handleProposeAdr = async () => {
    if (!token) return;
    const candidate = hotspots[0];
    await proposeAdrActionApi(token, candidate ? { block_id: candidate.block_id } : {});
    await refreshAdr();
  };

  const handleExecuteAdr = async (actionId: string) => {
    if (!token) return;
    await executeAdrActionApi(token, actionId);
    await refreshAdr();
  };

  const handleVerifyAdr = async (actionId: string) => {
    if (!token) return;
    await verifyAdrActionApi(token, actionId);
    await refreshAdr();
  };

  const handleResolveAdr = async (actionId: string) => {
    if (!token) return;
    await resolveAdrActionApi(token, actionId);
    await refreshAdr();
  };

  const openBlockDetails = (block: BlockData) => {
    setSelectedBlock(block);
    setDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-background grid-bg relative">
      <ParticleBackground />
      <div className="relative z-10 px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          <header className="pt-10 pb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-xs text-primary uppercase tracking-widest">Admin Dashboard</p>
              <h1 className="font-orbitron text-3xl md:text-4xl font-bold neon-text">
                {snapshot?.org.name ?? "EnergySense Campus"}
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Real-time contextual intelligence across all blocks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${streamDotClass} animate-pulse`} />
                {streamLabel}
              </div>
              <Button variant="outline" className="border-primary/40" onClick={handleExportCsv}>
                Export CSV
              </Button>
              <Button variant="outline" className="border-primary/40" onClick={() => navigate("/")}>Landing</Button>
              <Button variant="outline" className="border-destructive/40" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </header>

          {waitingForData ? (
            <section className="mb-8">
              <div className="glass-card neon-border rounded-lg p-5">
                <p className="font-mono text-xs uppercase tracking-widest text-warning">Waiting for data</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Stream is online, but no block events have been ingested yet. Add rows to `backend/data/sensor_stream.csv`
                  or post to `/ingest` to start live analytics.
                </p>
              </div>
            </section>
          ) : null}

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <div className="glass-card neon-border rounded-lg p-5">
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Environment Feed</p>
              <div className="mt-3 flex items-center gap-3">
                <CloudSun className="w-5 h-5 text-primary" />
                <span className="font-orbitron text-xl text-foreground">
                  {snapshot?.environment?.outside_temp?.toFixed(1) ?? "--"}°C
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {snapshot?.environment?.humidity?.toFixed(0) ?? "--"}% RH
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Live weather feed ingest</p>
            </div>
            <div className="glass-card neon-border rounded-lg p-5">
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Tariff Now</p>
              <div className="mt-3 text-2xl font-orbitron text-foreground">
                ₹{snapshot?.environment?.tariff_inr_per_kwh?.toFixed(2) ?? "--"} / kWh
              </div>
              <p className="text-xs text-muted-foreground mt-2">Time-of-use pricing stream</p>
            </div>
            <div className="glass-card neon-border rounded-lg p-5">
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Grid Carbon Intensity</p>
              <div className="mt-3 text-2xl font-orbitron text-foreground">
                {snapshot?.environment?.carbon_intensity_kg_per_kwh?.toFixed(2) ?? "--"} kg/kWh
              </div>
              <p className="text-xs text-muted-foreground mt-2">Live grid emission factor</p>
            </div>
            <div className="glass-card neon-border rounded-lg p-5">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Pathway State</p>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" title={baselineTooltip} />
              </div>
              <div className="mt-3 text-sm font-mono text-foreground space-y-1">
                <div>Last ingest: {pathwayState?.last_ingest_at ? new Date(pathwayState.last_ingest_at).toLocaleTimeString() : "--"}</div>
                <div>Event rate: {pathwayState?.event_rate_per_minute?.toFixed(1) ?? "0.0"} events/min</div>
                <div>Blocks updated: {pathwayState?.blocks_updated ?? 0}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Proof of live Pathway ingestion state</p>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-orbitron text-xl font-bold neon-text">LSTM Predictive Anomaly Engine</h2>
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Next-hour avoidable anomaly forecasting using sequence learning over energy, occupancy, and temperature.
              </p>
              {predictiveHotspots.length === 0 ? (
                <div className="rounded-lg border border-primary/20 bg-muted/30 p-4 text-sm text-muted-foreground font-mono">
                  {snapshot?.predictive_state?.model_ready
                    ? "No medium/high predictive risks currently."
                    : "Model warming up with live telemetry history..."}
                </div>
              ) : (
                <div className="space-y-3">
                  {predictiveHotspots.map((block) => (
                    <div key={block.block_id} className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{block.block_label}</p>
                        <span className="text-xs font-mono text-muted-foreground">
                          Risk {block.lstm_risk} · {(100 * (block.lstm_anomaly_probability ?? 0)).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Predicted deviation {block.lstm_predicted_deviation_pct?.toFixed(1) ?? "--"}% · Avoidable{" "}
                        {block.lstm_avoidable_kwh?.toFixed(2) ?? "--"} kWh in next hour
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{block.lstm_reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="glass-card neon-border rounded-lg p-6">
              <h2 className="font-orbitron text-xl font-bold neon-text mb-4">Predictive State</h2>
              <div className="space-y-3 text-sm font-mono">
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground uppercase">Model</p>
                  <p className="text-foreground">{snapshot?.predictive_state?.model_name ?? "LSTM-Hybrid-v1"}</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground uppercase">Ready</p>
                  <p className="text-foreground">{snapshot?.predictive_state?.model_ready ? "READY" : "WARMING UP"}</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground uppercase">Training Samples</p>
                  <p className="text-foreground">{snapshot?.predictive_state?.training_samples ?? 0}</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground uppercase">Avoidable Next Hour</p>
                  <p className="text-foreground">
                    {(snapshot?.totals.predicted_avoidable_kwh_next_hour ?? 0).toFixed(2)} kWh
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Last trained:{" "}
                  {snapshot?.predictive_state?.last_trained_at
                    ? new Date(snapshot.predictive_state.last_trained_at).toLocaleTimeString()
                    : "--"}
                </p>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className="glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Total Savings</p>
                  <p className="font-orbitron text-2xl font-bold neon-text-green">
                    {snapshot?.totals.total_savings_kwh?.toFixed(1) ?? "--"} kWh
                  </p>
                </div>
                <TrendingDown className="w-6 h-6 text-neon-green" />
              </div>
            </div>
            <div className="glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Waste Cost</p>
                  <p className="font-orbitron text-2xl font-bold text-foreground">
                    ₹{snapshot?.totals.total_waste_cost_inr?.toFixed(1) ?? "--"}
                  </p>
                </div>
                <TrendingDown className="w-6 h-6 text-warning" />
              </div>
            </div>
            <div className="glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">CO₂ Reduction</p>
                  <p className="font-orbitron text-2xl font-bold text-foreground">
                    {snapshot?.totals.co2_kg?.toFixed(1) ?? "--"} kg
                  </p>
                </div>
                <Leaf className="w-6 h-6 text-neon-green" />
              </div>
            </div>
            <div className="glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Efficiency Score</p>
                  <p className="font-orbitron text-2xl font-bold text-foreground">
                    {snapshot?.totals.efficiency_score?.toFixed(1) ?? "--"} / 100
                  </p>
                </div>
                <Gauge className="w-6 h-6 text-primary" />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            <div className="lg:col-span-2 glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-orbitron text-xl font-bold neon-text">Autonomous Demand Response</h2>
                <Button variant="outline" className="border-primary/40" onClick={handleProposeAdr} disabled={waitingForData}>
                  Simulate ADR Event
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                OpenADR-style event workflow: propose action, execute control, verify measured impact, resolve.
              </p>
              <div className="space-y-3">
                {effectiveActions.length === 0 ? (
                  <div className="rounded-lg border border-primary/20 bg-muted/30 p-4 text-sm text-muted-foreground font-mono">
                    No ADR actions yet.
                  </div>
                ) : (
                  effectiveActions.slice(0, 6).map((action) => (
                    <div key={action.id} className="rounded-lg border border-primary/20 bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{action.block_label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{action.dr_event_code} · {action.mode}</p>
                        </div>
                        <span className={`rounded-md border px-2 py-1 text-xs font-mono ${adrStatusStyles[action.status] ?? "bg-muted/20 border-muted text-muted-foreground"}`}>
                          {action.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{action.recommendation}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Target: {action.proposed_reduction_kwh.toFixed(2)} kWh · ₹{action.expected_inr_per_hour.toFixed(2)}/hr · {action.expected_co2_kg_per_hour.toFixed(2)} kgCO2/hr
                      </p>
                      {action.verification_note ? (
                        <p className="text-[11px] text-neon-green mt-1">
                          {action.verification_note}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {action.status === "PROPOSED" ? (
                          <Button size="sm" variant="outline" onClick={() => handleExecuteAdr(action.id)}>
                            <PlayCircle className="w-4 h-4 mr-1" />
                            Execute
                          </Button>
                        ) : null}
                        {action.status === "EXECUTED" ? (
                          <Button size="sm" variant="outline" onClick={() => handleVerifyAdr(action.id)}>
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Verify
                          </Button>
                        ) : null}
                        {action.status === "VERIFIED" ? (
                          <Button size="sm" variant="outline" onClick={() => handleResolveAdr(action.id)}>
                            Resolve
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass-card neon-border rounded-lg p-6">
              <h2 className="font-orbitron text-xl font-bold neon-text mb-4">Verified DR Impact</h2>
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase">Open Actions</p>
                  <p className="text-2xl font-orbitron text-foreground">{effectiveAdrSummary?.open_actions ?? 0}</p>
                </div>
                <div className="rounded-lg border border-neon-green/40 bg-neon-green/10 p-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase">Verified Savings</p>
                  <p className="text-2xl font-orbitron neon-text-green">
                    {(effectiveAdrSummary?.verified_savings_kwh ?? 0).toFixed(2)} kWh
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ₹{(effectiveAdrSummary?.verified_savings_inr ?? 0).toFixed(2)} · {(effectiveAdrSummary?.verified_co2_kg ?? 0).toFixed(2)} kg CO2
                  </p>
                </div>
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase">Execution State</p>
                  <p className="text-sm text-foreground mt-1">
                    {effectiveAdrSummary?.executed_actions ?? 0} executed · {effectiveAdrSummary?.verified_actions ?? 0} verified
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Zap className="w-4 h-4 text-warning" />
                    Measured post-action validation
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10">
            <div className="lg:col-span-2 glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-orbitron text-xl font-bold neon-text">Waste Heatmap</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                  <Radar className="w-4 h-4" />
                  {snapshot?.totals.waste_blocks ?? 0} hotspots detected
                </div>
              </div>
              {!snapshot || snapshot.blocks.length === 0 ? (
                <div className="rounded-lg border border-primary/20 bg-muted/30 p-6 text-sm text-muted-foreground font-mono">
                  Waiting for data
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {snapshot.blocks.map((block) => (
                    <div
                      key={block.block_id}
                      className={`border rounded-lg p-3 text-xs font-mono uppercase tracking-wider ${statusStyles[block.status]} cursor-pointer`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const detail = blockMap.get(block.block_id);
                        if (detail) openBlockDetails(detail);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          const detail = blockMap.get(block.block_id);
                          if (detail) openBlockDetails(detail);
                        }
                      }}
                    >
                      <div className="text-foreground font-semibold">{block.block_label}</div>
                      <div className="mt-2 text-muted-foreground">{block.status.replace("_", " ")}</div>
                      <div className="mt-1 text-foreground">{block.savings_kwh.toFixed(1)} kWh saved</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-card neon-border rounded-lg p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-orbitron text-xl font-bold neon-text">Hotspot Insights</h2>
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div className="space-y-3 flex-1">
                {waitingForData ? (
                  <div className="text-sm text-muted-foreground font-mono">Waiting for data</div>
                ) : hotspots.length === 0 ? (
                  <div className="text-sm text-muted-foreground font-mono">No critical waste detected.</div>
                ) : (
                  hotspots.map((block) => (
                    <div key={block.block_id} className="rounded-lg border border-warning/50 bg-warning/10 p-3">
                      <p className="text-sm font-semibold text-foreground">{block.block_label}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Status: {block.status.replace("_", " ")} · Savings {block.savings_kwh.toFixed(1)} kWh
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-6 rounded-lg border border-primary/30 bg-primary/10 p-4 text-xs font-mono text-muted-foreground">
                Last update: {snapshot ? new Date(snapshot.generated_at).toLocaleTimeString() : "--"}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10">
            <div className="lg:col-span-2 glass-card neon-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-orbitron text-xl font-bold neon-text">Energy Intelligence Copilot</h2>
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Ask anything about live energy usage, policy compliance, or waste causes. Uses live Pathway indexing.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={copilotQuestion}
                  onChange={(e) => setCopilotQuestion(e.target.value)}
                  placeholder="Why is Block D flagged as POSSIBLE WASTE?"
                  className="bg-muted/40"
                />
                <Button onClick={handleCopilotAsk}>Ask Copilot</Button>
              </div>
              <div className="mt-4 rounded-lg border border-primary/20 bg-muted/40 p-4 text-sm text-muted-foreground min-h-[120px]">
                {copilotAnswer ? copilotAnswer : "Copilot response will appear here."}
                {copilotCitations.length > 0 ? (
                  <div className="mt-3 text-xs font-mono text-muted-foreground">
                    Sources: {copilotCitations.map((c) => c.source).join(", ")}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="glass-card neon-border rounded-lg p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-orbitron text-xl font-bold neon-text">Live Alerts</h2>
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div className="space-y-3 flex-1">
                {alerts.length === 0 ? (
                  <div className="text-sm text-muted-foreground font-mono">No active alerts.</div>
                ) : (
                  alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="rounded-lg border border-warning/50 bg-warning/10 p-3">
                      <p className="text-sm font-semibold text-foreground">{alert.block_label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => handleAcknowledge(alert.id)}>
                          Acknowledge
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleResolve(alert.id)}>
                          Resolve
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="mt-12">
            <BlockStatusCards
              blocks={blocks}
              title="Block-Level Live Status"
              subtitle="Each block uses its own rolling baseline to detect contextual anomalies in real time."
              liveLabel={waitingForData ? "WAITING FOR DATA" : isLive ? "LIVE — Pathway streaming" : "SYNCING..."}
              totalSavingsOverride={snapshot?.totals.total_savings_kwh}
              onBlockClick={openBlockDetails}
            />
          </section>

          <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            {["daily", "weekly"].map((type) => {
              const report = reports.find((r) => r.report_type === type);
              return (
                <div key={type} className="glass-card neon-border rounded-lg p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-orbitron text-lg font-bold neon-text">{type.toUpperCase()} Report</h3>
                    <span className="text-xs font-mono text-muted-foreground">
                      {report?.generated_at ? new Date(report.generated_at).toLocaleTimeString() : "--"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {report?.content ?? "Generating report..."}
                  </p>
                </div>
              );
            })}
          </section>

          <section className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-card neon-border rounded-lg p-6">
              <h3 className="font-orbitron text-lg font-bold neon-text">Context Health</h3>
              <p className="text-sm text-muted-foreground mt-2">Average temperature and occupancy trends are healthy.</p>
              <div className="mt-4 flex items-center gap-3">
                <CloudSun className="w-6 h-6 text-primary" />
                <span className="font-mono text-sm">Avg Temp: {snapshot?.blocks.length ? (snapshot.blocks.reduce((sum, b) => sum + b.temperature, 0) / snapshot.blocks.length).toFixed(1) : "--"}°C</span>
              </div>
            </div>
            <div className="glass-card neon-border rounded-lg p-6">
              <h3 className="font-orbitron text-lg font-bold neon-text">Monthly Avoided</h3>
              <p className="text-sm text-muted-foreground mt-2">Projected avoided energy if actions persist.</p>
              <div className="mt-4 text-2xl font-orbitron">
                {snapshot?.totals.monthly_avoided_kwh?.toFixed(1) ?? "--"} kWh
              </div>
            </div>
            <div className="glass-card neon-border rounded-lg p-6">
              <h3 className="font-orbitron text-lg font-bold neon-text">Total Cost</h3>
              <p className="text-sm text-muted-foreground mt-2">Real-time energy spend across campus.</p>
              <div className="mt-4 text-2xl font-orbitron">
                ₹{snapshot?.totals.total_cost_inr?.toFixed(1) ?? "--"}
              </div>
            </div>
            <div className="glass-card neon-border rounded-lg p-6">
              <h3 className="font-orbitron text-lg font-bold neon-text">Active Streams</h3>
              <p className="text-sm text-muted-foreground mt-2">Pathway streaming window active for each block.</p>
              <div className="mt-4 text-2xl font-orbitron">
                {snapshot?.totals.block_count ?? "--"} live feeds
              </div>
            </div>
          </section>
        </div>
      </div>
      <BlockDetailModal block={selectedBlock} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
};

export default Dashboard;
