import axios, { AxiosInstance, AxiosError } from 'axios';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ProvisionResponse {
  cluster_id: string;
  status: string;
  message?: string;
}

export interface ExplainResponse {
  explanation: string;
  suggested_hint: string;
}

export interface IncidentContext {
  cluster_id: string;
  misconfig_type: string;
  user_query: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildAxios(baseURL: string, timeoutMs = 10_000): AxiosInstance {
  return axios.create({ baseURL, timeout: timeoutMs });
}

function isAxiosError(err: unknown): err is AxiosError {
  return axios.isAxiosError(err);
}

// ─────────────────────────────────────────────
// OrchestratorService
// ─────────────────────────────────────────────

export class OrchestratorService {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, timeoutMs = 10_000) {
    this.http = buildAxios(baseUrl, timeoutMs);
  }

  async provisionCluster(userId: string, level: number): Promise<string> {
    try {
      const response = await this.http.post<ProvisionResponse>('/api/v1/cluster/provision', {
        user_id: userId,
        level,
      });
      return response.data.cluster_id;
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status ?? 0;
        console.error('[OrchestratorService] provisionCluster failed', {
          status,
          data: err.response?.data,
        });
        if (status === 422) throw new Error('Invalid provisioning request');
        if (status >= 500) throw new Error('Orchestrator service unavailable');
      }
      throw new Error('Provisioning failed');
    }
  }

  async injectFault(clusterId: string, faultType: string): Promise<void> {
    try {
      await this.http.post('/api/v1/cluster/inject-fault', {
        cluster_id: clusterId,
        fault_type: faultType,
      });
    } catch (err) {
      if (isAxiosError(err)) {
        console.error('[OrchestratorService] injectFault failed', {
          status: err.response?.status,
          data: err.response?.data,
        });
      }
      throw new Error('Fault injection failed');
    }
  }
}

// ─────────────────────────────────────────────
// AgentService
// ─────────────────────────────────────────────

export class AgentService {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, timeoutMs = 30_000) {
    this.http = buildAxios(baseUrl, timeoutMs);
  }

  async explain(context: IncidentContext): Promise<ExplainResponse> {
    try {
      const response = await this.http.post<ExplainResponse>('/api/v1/explain', context);
      return response.data;
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status ?? 0;
        console.error('[AgentService] explain failed', {
          status,
          data: err.response?.data,
        });
        if (status === 503) throw new Error('AI service temporarily unavailable');
      }
      throw new Error('Failed to get explanation');
    }
  }
}

