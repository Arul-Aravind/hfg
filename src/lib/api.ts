import { DashboardSnapshot } from "@/types/dashboard";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    username: string;
    role: string;
    org_id: string;
    org_name: string;
  };
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error("Invalid username or password");
  }
  return res.json();
};

export const fetchDashboard = async (token: string): Promise<DashboardSnapshot> => {
  const res = await fetch(`${API_BASE}/dashboard/current-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error("Failed to fetch dashboard");
  }
  return res.json();
};

export const createStreamUrl = (token: string) => `${API_BASE}/dashboard/stream?token=${token}`;

export const fetchAlerts = async (token: string) => {
  const res = await fetch(`${API_BASE}/alerts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
};

export const acknowledgeAlert = async (token: string, alertId: string) => {
  const res = await fetch(`${API_BASE}/alerts/${alertId}/ack`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to acknowledge alert");
  return res.json();
};

export const resolveAlert = async (token: string, alertId: string) => {
  const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to resolve alert");
  return res.json();
};

export const askCopilot = async (token: string, question: string) => {
  const res = await fetch(`${API_BASE}/assistant/ask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error("Copilot request failed");
  return res.json();
};

export const explainCopilot = async (token: string, blockId: string) => {
  const res = await fetch(`${API_BASE}/assistant/explain`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ block_id: blockId }),
  });
  if (!res.ok) throw new Error("Copilot explain failed");
  return res.json();
};

export const fetchReports = async (token: string) => {
  const res = await fetch(`${API_BASE}/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch reports");
  return res.json();
};

export const fetchActions = async (token: string) => {
  const res = await fetch(`${API_BASE}/actions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch actions");
  return res.json();
};

export const proposeAction = async (
  token: string,
  payload: { block_id?: string; recommendation?: string; rationale?: string; reduction_kwh?: number } = {},
) => {
  const res = await fetch(`${API_BASE}/actions/propose`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to propose action");
  return res.json();
};

export const executeAction = async (token: string, actionId: string) => {
  const res = await fetch(`${API_BASE}/actions/${actionId}/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to execute action");
  return res.json();
};

export const verifyAction = async (token: string, actionId: string) => {
  const res = await fetch(`${API_BASE}/actions/${actionId}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to verify action");
  return res.json();
};

export const resolveAction = async (token: string, actionId: string) => {
  const res = await fetch(`${API_BASE}/actions/${actionId}/resolve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to resolve action");
  return res.json();
};
