export type WasteStatus = "NORMAL" | "NECESSARY" | "POSSIBLE_WASTE" | "WASTE";

export interface BlockHistoryPoint {
  ts: string;
  deviation_pct: number;
  energy_kwh: number;
  baseline_kwh: number;
}

export interface BlockStatus {
  block_id: string;
  block_label: string;
  energy_kwh: number;
  baseline_kwh: number;
  occupancy: number;
  temperature: number;
  status: WasteStatus;
  savings_kwh: number;
  deviation_pct: number;
  tariff_inr_per_kwh: number;
  cost_inr: number;
  waste_cost_inr: number;
  carbon_intensity_kg_per_kwh: number;
  co2_kg: number;
  root_cause: string;
  updated_at: string;
  history?: BlockHistoryPoint[];
  forecast_peak_deviation?: number;
  forecast_waste_risk?: string;
  lstm_predicted_deviation_pct?: number;
  lstm_anomaly_probability?: number;
  lstm_risk?: "LOW" | "MEDIUM" | "HIGH" | string;
  lstm_avoidable_kwh?: number;
  lstm_confidence?: number;
  lstm_model_name?: string;
  lstm_model_ready?: boolean;
  lstm_reason?: string;
}

export interface DashboardTotals {
  total_energy_kwh: number;
  total_savings_kwh: number;
  co2_kg: number;
  total_cost_inr: number;
  total_waste_cost_inr: number;
  total_co2_kg: number;
  efficiency_score: number;
  monthly_avoided_kwh: number;
  waste_blocks: number;
  block_count: number;
  adr_open_actions?: number;
  adr_verified_savings_kwh?: number;
  adr_verified_savings_inr?: number;
  adr_verified_co2_kg?: number;
  predicted_avoidable_kwh_next_hour?: number;
  predictive_high_risk_blocks?: number;
}

export interface DemandResponseAction {
  id: string;
  block_id: string;
  block_label: string;
  mode: "AUTOMATED" | "MANUAL" | string;
  status: "PROPOSED" | "EXECUTED" | "VERIFIED" | "RESOLVED" | string;
  recommendation: string;
  rationale: string;
  source: string;
  dr_event_code: string;
  proposed_reduction_kwh: number;
  expected_inr_per_hour: number;
  expected_co2_kg_per_hour: number;
  proposed_at: string;
  executed_at?: string | null;
  verified_at?: string | null;
  resolved_at?: string | null;
  operator?: string | null;
  pre_energy_kwh?: number | null;
  post_energy_kwh?: number | null;
  verified_savings_kwh?: number;
  verified_savings_inr?: number;
  verified_co2_kg?: number;
  verification_note?: string | null;
}

export interface AdrSummary {
  open_actions: number;
  executed_actions: number;
  verified_actions: number;
  verified_savings_kwh: number;
  verified_savings_inr: number;
  verified_co2_kg: number;
}

export interface DashboardSnapshot {
  generated_at: string;
  org: { id: string; name: string };
  blocks: BlockStatus[];
  totals: DashboardTotals;
  environment?: {
    outside_temp: number;
    humidity: number;
    tariff_inr_per_kwh: number;
    carbon_intensity_kg_per_kwh: number;
  };
  pathway_state?: {
    stream_status: "WAITING_FOR_DATA" | "IDLE" | "LIVE";
    last_ingest_at: string | null;
    events_last_minute: number;
    event_rate_per_minute: number;
    blocks_updated: number;
    baseline_example?: {
      block_id: string;
      block_label: string;
      baseline_kwh: number;
    } | null;
  };
  actions?: DemandResponseAction[];
  adr_summary?: AdrSummary;
  predictive_state?: {
    model_ready: boolean;
    model_name: string;
    training_samples: number;
    trained_with_lstm: boolean;
    last_trained_at: string | null;
    sequence_length: number;
    horizon_steps: number;
  };
}
