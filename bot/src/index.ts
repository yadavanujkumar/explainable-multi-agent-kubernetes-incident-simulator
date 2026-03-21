import { App, LogLevel } from '@slack/bolt';
import { OrchestratorService, AgentService } from './services';

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const orchestrator = new OrchestratorService(
  process.env.ORCHESTRATOR_URL || 'http://localhost:8080',
);
const agent = new AgentService(
  process.env.AGENT_URL || 'http://localhost:8000',
);

// ─────────────────────────────────────────────
// App bootstrap
// ─────────────────────────────────────────────

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
});

// ─────────────────────────────────────────────
// /simulate <level> — Start a new training session
// ─────────────────────────────────────────────

app.command('/simulate', async ({ command, ack, respond }) => {
  await ack();

  const level = parseInt(command.text?.trim() || '1', 10);
  if (isNaN(level) || level < 1 || level > 5) {
    await respond(':x: Usage: `/simulate <level>` where level is 1–5.');
    return;
  }

  try {
    const clusterId = await orchestrator.provisionCluster(command.user_id, level);
    await orchestrator.injectFault(clusterId, 'rbac-denial');

    await respond({
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚀 Simulation Started', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Cluster ID:*\n\`${clusterId}\`` },
            { type: 'mrkdwn', text: `*Difficulty Level:*\n${level}/5` },
            { type: 'mrkdwn', text: `*Injected Fault:*\nRBAC misconfiguration` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              'An RBAC misconfiguration has been injected. Use `/hint` with your question to get ' +
              'guided assistance, or `/explain` for context on the current scenario.',
          },
        },
      ],
    });
  } catch (err) {
    console.error('[/simulate] error', err);
    await respond(':x: Failed to start simulation. Please try again or contact an admin.');
  }
});

// ─────────────────────────────────────────────
// /hint <question> — Ask the XAI agent for a hint
// ─────────────────────────────────────────────

app.command('/hint', async ({ command, ack, respond }) => {
  await ack();

  const userQuery = command.text?.trim();
  if (!userQuery) {
    await respond(':x: Usage: `/hint <your question>` e.g. `/hint Why is my pod getting a 403?`');
    return;
  }

  await respond({ text: '🤔 Consulting the AI tutor…', response_type: 'ephemeral' });

  try {
    const result = await agent.explain({
      cluster_id: `vcluster-${command.user_id}`,
      misconfig_type: 'rbac-denial',
      user_query: userQuery,
    });

    await respond({
      replace_original: true,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '💡 AI Tutor Hint', emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Explanation:*\n${result.explanation}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Hint:*\n${result.suggested_hint}` },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '_Remember: try to solve it yourself first!_' }],
        },
      ],
    });
  } catch (err) {
    console.error('[/hint] error', err);
    await respond({
      replace_original: true,
      text: ':x: Could not retrieve a hint right now. Please try again shortly.',
    });
  }
});

// ─────────────────────────────────────────────
// /explain <topic> — Get background on a K8s concept
// ─────────────────────────────────────────────

app.command('/explain', async ({ command, ack, respond }) => {
  await ack();

  const topic = command.text?.trim() || 'RBAC';

  try {
    const result = await agent.explain({
      cluster_id: `vcluster-${command.user_id}`,
      misconfig_type: topic.toLowerCase().replace(/\s+/g, '-'),
      user_query: `Explain the Kubernetes concept: ${topic}`,
    });

    await respond({
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📖 Explanation: ${topic}`, emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: result.explanation },
        },
      ],
    });
  } catch (err) {
    console.error('[/explain] error', err);
    await respond(':x: Could not generate an explanation. Please try again.');
  }
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

(async () => {
  await app.start(port);
  console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
})();

