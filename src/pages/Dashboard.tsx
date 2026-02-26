import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Brain,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { clearToken, getToken } from "@/lib/auth";
import { useDashboardStream } from "@/hooks/useDashboardStream";
import { AdrSummary, DashboardSnapshot, DemandResponseAction } from "@/types/dashboard";
import {
  acknowledgeAlert,
  applyTwinManualControl,
  executeAction as executeAdrActionApi,
  fetchActions,
  fetchAlerts,
  fetchReports,
  proposeAction as proposeAdrActionApi,
  resolveAction as resolveAdrActionApi,
  resolveAlert,
  verifyAction as verifyAdrActionApi,
} from "@/lib/api";

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

const SYNTHETIC_REPORTS_DEMO_MODE =
  (import.meta.env.VITE_SYNTHETIC_REPORTS_DEMO_MODE ?? "true") !== "false";

const Dashboard = () => {
  const navigate = useNavigate();
  const token = getToken();
  const { data, status, lastMessageAt } = useDashboardStream(token);
  const [fallback, setFallback] = useState<DashboardSnapshot | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [actions, setActions] = useState<DemandResponseAction[]>([]);
  const [adrSummary, setAdrSummary] = useState<AdrSummary | null>(null);
  const [reportVariantIndex, setReportVariantIndex] = useState(0);
  const [selectedTwinBlockId, setSelectedTwinBlockId] = useState<string>("");
  const [twinHvacEco, setTwinHvacEco] = useState(false);
  const [twinLightsOff, setTwinLightsOff] = useState(false);
  const [twinVentEco, setTwinVentEco] = useState(false);
  const [twinSetpointDelta, setTwinSetpointDelta] = useState(2);
  const [twinDurationMinutes, setTwinDurationMinutes] = useState(15);
  const [twinApplyBusy, setTwinApplyBusy] = useState(false);

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

  useEffect(() => {
    if (!SYNTHETIC_REPORTS_DEMO_MODE) return;
    const id = window.setInterval(() => {
      setReportVariantIndex((prev) => (prev + 1) % 5);
    }, 7000);
    return () => window.clearInterval(id);
  }, []);

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

  const twinState = snapshot?.digital_twin;
  const twinEffects = twinState?.active_effect_details ?? [];
  const twinEffectsByActionId = useMemo(() => {
    const map = new Map<string, (typeof twinEffects)[number][]>();
    twinEffects.forEach((effect) => {
      if (!effect.action_id) return;
      const list = map.get(effect.action_id) ?? [];
      list.push(effect);
      map.set(effect.action_id, list);
    });
    return map;
  }, [twinEffects]);

  const selectedTwinBlock = useMemo(
    () => snapshot?.blocks.find((block) => block.block_id === selectedTwinBlockId) ?? null,
    [snapshot, selectedTwinBlockId],
  );

  useEffect(() => {
    if (!snapshot?.blocks?.length) {
      setSelectedTwinBlockId("");
      return;
    }
    if (!selectedTwinBlockId || !snapshot.blocks.some((block) => block.block_id === selectedTwinBlockId)) {
      setSelectedTwinBlockId(snapshot.blocks[0].block_id);
    }
  }, [snapshot?.blocks, selectedTwinBlockId]);

  useEffect(() => {
    if (!selectedTwinBlock) return;
    setTwinHvacEco(selectedTwinBlock.twin_control_state?.hvac_mode === "ECO");
    setTwinLightsOff(selectedTwinBlock.twin_control_state?.lights_on === false);
    setTwinVentEco(selectedTwinBlock.twin_control_state?.ventilation_mode === "ECO");
  }, [
    selectedTwinBlock?.block_id,
    selectedTwinBlock?.twin_control_state?.hvac_mode,
    selectedTwinBlock?.twin_control_state?.lights_on,
    selectedTwinBlock?.twin_control_state?.ventilation_mode,
  ]);

  const syntheticReportContent = useMemo(() => {
    const blockCount = snapshot?.totals.block_count ?? 0;
    const totalSavings = snapshot?.totals.total_savings_kwh ?? 0;
    const totalWasteCost = snapshot?.totals.total_waste_cost_inr ?? 0;
    const co2Avoided = snapshot?.totals.co2_kg ?? 0;
    const efficiency = snapshot?.totals.efficiency_score ?? 0;
    const predictedAvoidable = snapshot?.totals.predicted_avoidable_kwh_next_hour ?? 0;
    const topHotspots = hotspots.slice(0, 3);
    const topHotspotText = topHotspots.length
      ? topHotspots
          .map((b) => `${b.block_label} (${b.status.replace("_", " ")}, ${b.savings_kwh.toFixed(1)} kWh)`)
          .join(", ")
      : "No active waste hotspots in this cycle.";
    const topPredictive = predictiveHotspots[0];
    const pathwayRate = pathwayState?.event_rate_per_minute ?? 0;
    const adrVerified = effectiveAdrSummary?.verified_savings_kwh ?? 0;

    const daily = [
      [
        "Daily Energy Intelligence Summary (Scenario 1/5)",
        `Campus coverage: ${blockCount} blocks live on Pathway stream.`,
        `Current avoidable energy identified: ${totalSavings.toFixed(2)} kWh | Waste cost exposure: ₹${totalWasteCost.toFixed(2)} | CO2 avoided: ${co2Avoided.toFixed(2)} kg.`,
        `Top hotspots: ${topHotspotText}`,
      ].join("\n\n"),
      [
        "Daily Energy Intelligence Summary (Scenario 2/5)",
        `Efficiency score is ${efficiency.toFixed(1)}/100 with stream throughput at ${pathwayRate.toFixed(1)} events/min.`,
        `Immediate next-hour avoidable anomaly forecast: ${predictedAvoidable.toFixed(2)} kWh.`,
        topPredictive
          ? `Highest predictive risk: ${topPredictive.block_label} (${topPredictive.lstm_risk}) with ${(100 * (topPredictive.lstm_anomaly_probability ?? 0)).toFixed(0)}% anomaly probability.`
          : "Predictive engine reports no medium/high risk block in the next-hour window.",
      ].join("\n\n"),
      [
        "Daily Energy Intelligence Summary (Scenario 3/5)",
        `Operational focus: tighten schedules in low-occupancy zones and validate HVAC setpoints in waste-classified blocks.`,
        `Observed savings this cycle: ${totalSavings.toFixed(2)} kWh; verified ADR contribution so far: ${adrVerified.toFixed(2)} kWh.`,
        `Priority review list: ${topHotspotText}`,
      ].join("\n\n"),
      [
        "Daily Energy Intelligence Summary (Scenario 4/5)",
        `Cost-first view: current avoidable load corresponds to ₹${totalWasteCost.toFixed(2)} of waste-cost exposure under active tariff conditions.`,
        `Carbon-first view: real-time optimization is tracking ${co2Avoided.toFixed(2)} kg CO2 reduction potential.`,
        `Recommended next action: execute/verify ADR on the highest deviation low-occupancy block.`,
      ].join("\n\n"),
      [
        "Daily Energy Intelligence Summary (Scenario 5/5)",
        `Pathway state indicates ${pathwayState?.blocks_updated ?? 0} blocks updated in the last minute with latest ingest at ${
          pathwayState?.last_ingest_at ? new Date(pathwayState.last_ingest_at).toLocaleTimeString() : "--"
        }.`,
        `Campus trend remains ${topHotspots.length ? "intervention-worthy" : "stable"} with ${predictedAvoidable.toFixed(2)} kWh forecast avoidable anomaly load next hour.`,
        `Top hotspots: ${topHotspotText}`,
      ].join("\n\n"),
    ];

    const weeklySavingsSynthetic = totalSavings * 7;
    const weeklyCostSynthetic = totalWasteCost * 7;
    const weeklyCo2Synthetic = co2Avoided * 7;
    const weeklyAdrSynthetic = adrVerified * 7;

    const weekly = [
      [
        "Weekly Energy Intelligence Summary (Scenario 1/5)",
        `Projected weekly savings at current operating pattern: ${weeklySavingsSynthetic.toFixed(2)} kWh, equivalent to ₹${weeklyCostSynthetic.toFixed(2)} avoidable cost and ${weeklyCo2Synthetic.toFixed(2)} kg CO2 impact.`,
        `Recurring hotspot clusters: ${topHotspotText}`,
      ].join("\n\n"),
      [
        "Weekly Energy Intelligence Summary (Scenario 2/5)",
        `Control-performance view: ADR workflow scales to an estimated ${weeklyAdrSynthetic.toFixed(2)} kWh verified reduction if current response rate is sustained.`,
        `Primary leverage areas remain low-occupancy/high-deviation blocks and setpoint governance.`,
      ].join("\n\n"),
      [
        "Weekly Energy Intelligence Summary (Scenario 3/5)",
        `Forecast-led operations: predictive anomaly engine is currently estimating ${predictedAvoidable.toFixed(2)} kWh next-hour avoidable load; converting these early warnings to actions improves weekly outcomes.`,
        topPredictive
          ? `Current lead indicator block: ${topPredictive.block_label} (${topPredictive.lstm_risk} predictive risk).`
          : "No lead indicator block currently exceeds the predictive risk threshold.",
      ].join("\n\n"),
      [
        "Weekly Energy Intelligence Summary (Scenario 4/5)",
        `Sustainability cadence recommendation: daily operator review + twice-daily ADR verification + weekly block accountability review.`,
        `At current efficiency (${efficiency.toFixed(1)}/100), the campus is positioned for measurable savings with stronger control discipline.`,
      ].join("\n\n"),
      [
        "Weekly Energy Intelligence Summary (Scenario 5/5)",
        `Streaming health remains suitable for weekly analytics: ${blockCount} blocks monitored, ${pathwayRate.toFixed(1)} events/min active feed rate.`,
        `Weekly optimization narrative: capture avoidable load earlier, verify ADR gains, and reduce repeat hotspot recurrence in top 3 blocks.`,
        `Top recurring candidates: ${topHotspotText}`,
      ].join("\n\n"),
    ];

    return {
      daily: daily[reportVariantIndex % 5],
      weekly: weekly[reportVariantIndex % 5],
    };
  }, [snapshot, hotspots, predictiveHotspots, pathwayState, effectiveAdrSummary, reportVariantIndex]);

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

  const handleApplyTwinControls = async (reset = false) => {
    if (!token || !selectedTwinBlockId) return;
    setTwinApplyBusy(true);
    try {
      await applyTwinManualControl(token, {
        block_id: selectedTwinBlockId,
        hvac_eco: reset ? false : twinHvacEco,
        lights_off: reset ? false : twinLightsOff,
        ventilation_eco: reset ? false : twinVentEco,
        hvac_setpoint_delta_c: reset ? 2 : twinSetpointDelta,
        duration_minutes: reset ? 15 : twinDurationMinutes,
        replace_existing: true,
      });
      if (reset) {
        setTwinHvacEco(false);
        setTwinLightsOff(false);
        setTwinVentEco(false);
      }
    } catch (error) {
      console.error("Failed to apply digital twin controls", error);
    } finally {
      setTwinApplyBusy(false);
    }
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
                  effectiveActions.slice(0, 6).map((action) => {
                    const actionTwinEffects = twinEffectsByActionId.get(action.id) ?? [];
                    return (
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
                      {actionTwinEffects.length > 0 ? (
                        <div className="mt-2 rounded-md border border-primary/30 bg-primary/10 p-2 text-[11px] font-mono text-muted-foreground">
                          Digital twin active ({actionTwinEffects.length} effect{actionTwinEffects.length > 1 ? "s" : ""}):{" "}
                          {actionTwinEffects.map((e) => `${e.control_type} ${e.progress_pct.toFixed(0)}% ${e.stage}`).join(" · ")}
                        </div>
                      ) : null}
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
                  )})
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
            <div className="lg:col-span-3 glass-card neon-border rounded-lg p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-orbitron text-xl font-bold neon-text">Digital Twin Closed Loop (Option A + Option B)</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Option A overlays a counterfactual preview, while Option B modifies the live synthetic/CSV sensor stream after action execution.
                  </p>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {twinState?.active_effects ?? 0} active effects · {twinState?.controlled_blocks ?? 0} controlled blocks
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase">Option A — Overlay Twin</p>
                  <p className="text-lg font-orbitron text-foreground mt-1">
                    {twinState?.option_a_overlay_enabled ? "ENABLED" : "DISABLED"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Instant preview delta: {(snapshot?.totals.digital_twin_overlay_delta_kwh_now ?? 0).toFixed(2)} kWh
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Preview blocks: {twinState?.overlay_preview_blocks ?? 0}
                  </p>
                </div>

                <div className="rounded-lg border border-neon-green/40 bg-neon-green/10 p-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase">Option B — Sensor Source Twin</p>
                  <p className="text-lg font-orbitron text-foreground mt-1">
                    {twinState?.option_b_source_enabled ? "ACTIVE" : "DISABLED"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Source-adjusted blocks: {snapshot?.totals.digital_twin_source_active_blocks ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last source trace:{" "}
                    {twinState?.last_source_trace?.ts
                      ? new Date(twinState.last_source_trace.ts).toLocaleTimeString()
                      : "--"}
                  </p>
                </div>

                <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
                  <p className="text-xs text-muted-foreground font-mono uppercase">Last Twin Response</p>
                  {twinState?.last_source_trace ? (
                    <>
                      <p className="text-sm text-foreground mt-1">
                        {twinState.last_source_trace.block_id} · {twinState.last_source_trace.stage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Raw {twinState.last_source_trace.raw_energy_kwh.toFixed(2)} → Sim{" "}
                        {twinState.last_source_trace.simulated_energy_kwh.toFixed(2)} kWh
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reduction {twinState.last_source_trace.reduction_pct.toFixed(1)}% · {twinState.last_source_trace.source}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2">No twin-adjusted events yet. Execute an ADR action to trigger the response loop.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <div className="rounded-lg border border-primary/20 bg-muted/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground font-mono uppercase">Active Control Effects</p>
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  {twinEffects.length === 0 ? (
                    <p className="text-sm text-muted-foreground font-mono">No active digital-twin control effects.</p>
                  ) : (
                    <div className="space-y-2">
                      {twinEffects.slice(0, 6).map((effect) => (
                        <div key={effect.effect_id} className="rounded-md border border-primary/20 bg-primary/5 p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-foreground font-semibold">{effect.block_label}</p>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {effect.stage} · {effect.progress_pct.toFixed(0)}% · {effect.remaining_seconds}s
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono mt-1">
                            {effect.control_type} · target {effect.target_reduction_pct.toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-primary/20 bg-muted/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground font-mono uppercase">Recent Twin Action Activations</p>
                    <Radar className="w-4 h-4 text-primary" />
                  </div>
                  {!(twinState?.recent_actions?.length) ? (
                    <p className="text-sm text-muted-foreground font-mono">Execute an ADR action to watch the closed-loop response begin.</p>
                  ) : (
                    <div className="space-y-2">
                      {twinState.recent_actions.slice(0, 4).map((item, idx) => (
                        <div key={`${item.ts}-${item.block_id}-${idx}`} className="rounded-md border border-primary/20 bg-primary/5 p-2">
                          <p className="text-xs text-foreground font-semibold">
                            {item.block_label} · {item.expected_reduction_pct.toFixed(1)}% expected
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono mt-1">
                            {new Date(item.ts).toLocaleTimeString()} · {item.stage} · {item.source}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{item.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-primary/20 bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono uppercase">Manual Twin Control Panel</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Directly simulate control actions on any block (HVAC/lights/ventilation) and watch the closed-loop response.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    Source mode {twinState?.option_b_source_enabled ? "ON" : "OFF"} · Overlay mode {twinState?.option_a_overlay_enabled ? "ON" : "OFF"}
                  </span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-1 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="twin-block" className="text-xs font-mono uppercase text-muted-foreground">
                        Target Block
                      </Label>
                      <select
                        id="twin-block"
                        value={selectedTwinBlockId}
                        onChange={(event) => setSelectedTwinBlockId(event.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                        disabled={!snapshot?.blocks?.length || twinApplyBusy}
                      >
                        {(snapshot?.blocks ?? []).map((block) => (
                          <option key={block.block_id} value={block.block_id}>
                            {block.block_label} ({block.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs font-mono text-muted-foreground">
                      {selectedTwinBlock ? (
                        <>
                          <div>Current: {selectedTwinBlock.energy_kwh.toFixed(2)} kWh vs baseline {selectedTwinBlock.baseline_kwh.toFixed(2)} kWh</div>
                          <div className="mt-1">
                            Source twin: {selectedTwinBlock.twin_source?.applied ? "ACTIVE" : "IDLE"} ·{" "}
                            {selectedTwinBlock.twin_source?.reduction_pct?.toFixed(1) ?? "0.0"}%
                          </div>
                          <div className="mt-1">
                            Overlay preview: {selectedTwinBlock.twin_overlay?.applied ? `${selectedTwinBlock.twin_overlay.reduction_pct?.toFixed(1)}%` : "none"}
                          </div>
                        </>
                      ) : (
                        <div>Waiting for block telemetry...</div>
                      )}
                    </div>
                  </div>

                  <div className="xl:col-span-1 space-y-3">
                    <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3">
                      <div>
                        <p className="text-sm text-foreground">HVAC Eco Mode</p>
                        <p className="text-[11px] text-muted-foreground">Ramped setpoint increase for cooling load reduction</p>
                      </div>
                      <Switch checked={twinHvacEco} onCheckedChange={setTwinHvacEco} disabled={twinApplyBusy || !selectedTwinBlockId} />
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3">
                      <div>
                        <p className="text-sm text-foreground">Lights Off (Non-critical)</p>
                        <p className="text-[11px] text-muted-foreground">Immediate discretionary lighting shed</p>
                      </div>
                      <Switch checked={twinLightsOff} onCheckedChange={setTwinLightsOff} disabled={twinApplyBusy || !selectedTwinBlockId} />
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3">
                      <div>
                        <p className="text-sm text-foreground">Ventilation Eco</p>
                        <p className="text-[11px] text-muted-foreground">Lower fan/ventilation energy with ramp delay</p>
                      </div>
                      <Switch checked={twinVentEco} onCheckedChange={setTwinVentEco} disabled={twinApplyBusy || !selectedTwinBlockId} />
                    </div>
                  </div>

                  <div className="xl:col-span-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="twin-setpoint" className="text-xs font-mono uppercase text-muted-foreground">
                          HVAC +°C
                        </Label>
                        <Input
                          id="twin-setpoint"
                          type="number"
                          min={1}
                          max={4}
                          step={0.5}
                          value={twinSetpointDelta}
                          onChange={(e) => setTwinSetpointDelta(Number(e.target.value || 2))}
                          disabled={twinApplyBusy || !selectedTwinBlockId}
                          className="bg-muted/40"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="twin-duration" className="text-xs font-mono uppercase text-muted-foreground">
                          Duration (min)
                        </Label>
                        <Input
                          id="twin-duration"
                          type="number"
                          min={1}
                          max={60}
                          step={1}
                          value={twinDurationMinutes}
                          onChange={(e) => setTwinDurationMinutes(Number(e.target.value || 15))}
                          disabled={twinApplyBusy || !selectedTwinBlockId}
                          className="bg-muted/40"
                        />
                      </div>
                    </div>

                    <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-[11px] text-muted-foreground">
                      Manual twin controls replace current twin effects for the selected block to keep the simulation judge-readable.
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="border-primary/40"
                        onClick={() => handleApplyTwinControls(false)}
                        disabled={twinApplyBusy || !selectedTwinBlockId}
                      >
                        {twinApplyBusy ? "Applying..." : "Apply Twin Controls"}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-destructive/40"
                        onClick={() => handleApplyTwinControls(true)}
                        disabled={twinApplyBusy || !selectedTwinBlockId}
                      >
                        Reset Block to Normal
                      </Button>
                    </div>
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
                      {block.twin_source?.active_effects ? (
                        <div className="mt-1 text-[10px] text-primary">
                          Twin {block.twin_source.stage} · -{block.twin_source.reduction_pct.toFixed(1)}%
                        </div>
                      ) : null}
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

          <section className="grid grid-cols-1 gap-6 mt-10">
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
                    <div className="flex items-center gap-3">
                      <h3 className="font-orbitron text-lg font-bold neon-text">{type.toUpperCase()} Report</h3>
                      {SYNTHETIC_REPORTS_DEMO_MODE ? (
                        <span className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-warning">
                          Demo Mode · {reportVariantIndex + 1}/5
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {report?.generated_at ? new Date(report.generated_at).toLocaleTimeString() : "--"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {SYNTHETIC_REPORTS_DEMO_MODE
                      ? type === "daily"
                        ? syntheticReportContent.daily
                        : syntheticReportContent.weekly
                      : (report?.content ?? "Generating report...")}
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
