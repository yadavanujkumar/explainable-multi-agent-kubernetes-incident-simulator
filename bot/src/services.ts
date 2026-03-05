import axios from 'axios';

export class OrchestratorService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async provisionCluster(userId: string, level: number): Promise<string> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/v1/cluster/provision`, {
        user_id: userId,
        level: level
      });
      return response.data.cluster_id;
    } catch (error) {
      console.error('Failed to provision cluster:', error);
      throw new Error('Provisioning failed');
    }
  }
}
