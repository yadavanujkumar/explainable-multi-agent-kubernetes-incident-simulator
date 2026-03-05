import { OrchestratorService } from '../src/services';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OrchestratorService', () => {
  it('should provision a cluster and return cluster_id', async () => {
    const mockResponse = { data: { cluster_id: 'vcluster-U12345', status: 'provisioning' } };
    mockedAxios.post.mockResolvedValueOnce(mockResponse);

    const service = new OrchestratorService('http://mocked-url');
    const clusterId = await service.provisionCluster('U12345', 1);

    expect(mockedAxios.post).toHaveBeenCalledWith('http://mocked-url/api/v1/cluster/provision', {
      user_id: 'U12345',
      level: 1
    });
    expect(clusterId).toBe('vcluster-U12345');
  });

  it('should throw an error if provisioning fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

    const service = new OrchestratorService('http://mocked-url');
    await expect(service.provisionCluster('U12345', 1)).rejects.toThrow('Provisioning failed');
  });
});
