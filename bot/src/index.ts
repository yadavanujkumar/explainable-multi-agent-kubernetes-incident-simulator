import { App } from '@slack/bolt';
import { OrchestratorService } from './services';

const orchestrator = new OrchestratorService(process.env.ORCHESTRATOR_URL || 'http://localhost:8080');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Command to start simulation
app.command('/simulate', async ({ command, ack, respond }) => {
  await ack();
  try {
    const clusterId = await orchestrator.provisionCluster(command.user_id, 1);
    await respond(`Simulation started! Your ephemeral cluster ID is: ${clusterId}. I am injecting an RBAC misconfiguration now...`);
  } catch (error) {
    await respond(`Error starting simulation. Please contact an admin.`);
  }
});

(async () => {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  await app.start(port);
  console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
})();
