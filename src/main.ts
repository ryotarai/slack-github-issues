import * as bolt from '@slack/bolt';
import { GitHubListener, ListenerArgs } from './listener';
import * as fs from 'fs';
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN!,
  baseUrl: process.env.GITHUB_BASE_URL || "https://api.github.com",
});

const app = new bolt.App({
  token: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  logLevel: bolt.LogLevel.INFO,
});

interface Config {
  listeners: ListenerArgs[];
}

const config: Config = JSON.parse(fs.readFileSync(process.env.GITHUB_SLACK_CONFIG!, 'utf8'))

for (const c of config.listeners) {
  const listener = new GitHubListener(app, c, octokit);
}

(async () => {
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();
