import { OrchestratorService, AgentService } from '../src/services';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Ensure axios.create returns a mocked instance
const mockHttp = {
  post: jest.fn(),
  get: jest.fn(),
};
mockedAxios.create.mockReturnValue(mockHttp as any);
// Use the real isAxiosError implementation to avoid circular mocking
const realIsAxiosError = jest.requireActual<typeof axios>('axios').isAxiosError;
mockedAxios.isAxiosError.mockImplementation(realIsAxiosError);

// ─────────────────────────────────────────────
// OrchestratorService
// ─────────────────────────────────────────────

describe('OrchestratorService', () => {
  let service: OrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrchestratorService('http://mocked-url');
  });

  describe('provisionCluster', () => {
    it('returns cluster_id on success', async () => {
      mockHttp.post.mockResolvedValueOnce({
        data: { cluster_id: 'vcluster-U12345', status: 'provisioning' },
      });

      const clusterId = await service.provisionCluster('U12345', 1);

      expect(mockHttp.post).toHaveBeenCalledWith('/api/v1/cluster/provision', {
        user_id: 'U12345',
        level: 1,
      });
      expect(clusterId).toBe('vcluster-U12345');
    });

    it('throws "Provisioning failed" when request errors', async () => {
      mockHttp.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.provisionCluster('U12345', 1)).rejects.toThrow('Provisioning failed');
    });
  });

  describe('injectFault', () => {
    it('resolves on success', async () => {
      mockHttp.post.mockResolvedValueOnce({ data: { status: 'injected' } });

      await expect(service.injectFault('vcluster-U12345', 'rbac-denial')).resolves.toBeUndefined();
      expect(mockHttp.post).toHaveBeenCalledWith('/api/v1/cluster/inject-fault', {
        cluster_id: 'vcluster-U12345',
        fault_type: 'rbac-denial',
      });
    });

    it('throws "Fault injection failed" on error', async () => {
      mockHttp.post.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.injectFault('vcluster-U12345', 'rbac-denial')).rejects.toThrow(
        'Fault injection failed',
      );
    });
  });
});

// ─────────────────────────────────────────────
// AgentService
// ─────────────────────────────────────────────

describe('AgentService', () => {
  let service: AgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentService('http://mocked-agent-url');
  });

  it('returns explanation and hint on success', async () => {
    mockHttp.post.mockResolvedValueOnce({
      data: {
        explanation: 'RBAC controls access.',
        suggested_hint: 'Check the RoleBinding.',
      },
    });

    const result = await service.explain({
      cluster_id: 'vcluster-U12345',
      misconfig_type: 'rbac-denial',
      user_query: 'Why 403?',
    });

    expect(result.explanation).toBe('RBAC controls access.');
    expect(result.suggested_hint).toBe('Check the RoleBinding.');
  });

  it('throws "Failed to get explanation" on network error', async () => {
    mockHttp.post.mockRejectedValueOnce(new Error('timeout'));

    await expect(
      service.explain({
        cluster_id: 'vcluster-U12345',
        misconfig_type: 'rbac-denial',
        user_query: 'Help!',
      }),
    ).rejects.toThrow('Failed to get explanation');
  });
});

