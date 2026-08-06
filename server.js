/*
require("dotenv").config();
const crypto = require('crypto');
const { Octokit } = require('@octokit/core');
const { createAppAuth } = require('@octokit/auth-app');

const express = require("express");
const app = express();
const port = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "GitHub App is running",
    appName: process.env.APP_NAME,
    appId: process.env.APP_ID,
    hasPrivateKey: !!process.env.PRIVATE_KEY,
    hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
  });  
});

async function getInstallationToken(installationId) {
  try {
    const auth = createAppAuth({
      appId: process.env.APP_ID,
      privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    });

    const installationAuth = await auth({
      type: "installation",
      installationId: installationId,
    });

    return installationAuth.token;

  } catch (error) {
      console.error("Error getting installation token: ", error);
      throw error;
  }
}

function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"];

  if (!signature) {
    console.log("No signature provided");
    return false;
  }

  try {
    const hmac = crypto.createHmac(
      "sha256",
      process.env.WEBHOOK_SECRET
    );

    const digest =
      "sha256=" +
      hmac
        .update(JSON.stringify(req.body))
        .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );

  } catch (error) {
     console.log("Signature verification error:", error);
     return false;
    }
}

app.post("/webhook", async (req, res) => {
  console.log("Webhook request received");

  if (!verifySignature(req)) {
    console.log("Invalid signature");
    return res.status(401).json({
      error: "Invalid signature"
    });
  }

  const event = req.headers["x-github-event"];
  console.log("Event: ", event);

  if (event == "ping") {
    console.log("GitHub App webhook is working!");
    return res.status(200).json({
      status: "ping"
    });
  }

  res.status(200).json({
    status: "received"
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
*/

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Octokit } = require('@octokit/core');
const { createAppAuth } = require('@octokit/auth-app');

const app = express();
const port = 3000;

// Middleware to parse JSON
app.use(express.json());

// Verify webhook signature
function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.log('❌ No signature provided');
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch (error) {
    console.log('❌ Error verifying signature:', error);
    return false;
  }
}

// Get installation access token using modern Octokit
async function getInstallationToken(installationId) {
  try {
    const auth = createAppAuth({
      appId: process.env.APP_ID,
      privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    });

    const installationAuth = await auth({
      type: 'installation',
      installationId: installationId,
    });

    console.log("TOKEN:", installationAuth.token); 

    return installationAuth.token;
  } catch (error) {
    console.error('❌ Error getting installation token:', error);
    throw error;
  }
}

// Webhook handler
app.post('/webhook', async (req, res) => {
  console.log('📨 Received webhook request');
  
  // Verify signature
  if (!verifySignature(req)) {
    console.log('❌ Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`🎯 Event: ${event}, Action: ${payload.action}`);

  try {
    // Handle ping event (app installation)
    if (event === 'ping') {
      console.log('✅ GitHub App installed successfully!');
      console.log('🎉 Webhook is working!');
      return res.status(200).json({ status: 'pong' });
    }

    // Handle new issues
    if (event === 'issues' && payload.action === 'opened') {
      console.log(`🆕 New issue #${payload.issue.number}: ${payload.issue.title}`);
      
      const token = await getInstallationToken(payload.installation.id);
      const octokit = new Octokit({ auth: token });

      // Add welcome comment
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        body: `👋 Hello @${payload.sender.login}! Thanks for opening this issue!\n\nWe appreciate you taking the time to report this. Our team will review it soon.`,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      // Add label
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        labels: ['triage', 'first-time-contributor'],
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      console.log(`✅ Processed issue #${payload.issue.number} successfully!`);
    }

    // Handle new pull requests
    if (event === 'pull_request' && payload.action === 'opened') {
      console.log(`🆕 New PR #${payload.pull_request.number}: ${payload.pull_request.title}`);
      
      const token = await getInstallationToken(payload.installation.id);
      const octokit = new Octokit({ auth: token });

      // Add welcome comment
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        body: `🎉 Awesome @${payload.sender.login}! Thanks for your first pull request!\n\nWe'll review your changes soon. Thank you for contributing! 🚀`,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      // Add size-based label
      const additions = payload.pull_request.additions;
      const deletions = payload.pull_request.deletions;
      const totalChanges = additions + deletions;
      
      let sizeLabel = 'size/small';
      if (totalChanges > 500) sizeLabel = 'size/large';
      else if (totalChanges > 100) sizeLabel = 'size/medium';

      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.pull_request.number,
        labels: [sizeLabel, 'first-time-contributor'],
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      console.log(`✅ Processed PR #${payload.pull_request.number} with label: ${sizeLabel}`);
    }

    res.status(200).json({ status: 'processed' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'GitHub App is running! 🚀',
    technology: 'JavaScript/Node.js with Modern Octokit',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: 'POST /webhook',
      health: 'GET /'
    }
  });
});

// Installation guide endpoint
app.get('/install', (req, res) => {
  const appName = process.env.APP_NAME || 'your-github-app';
  const installUrl = `https://github.com/apps/${appName}/installations/new`;
  
  res.json({
    message: 'Install the GitHub App',
    install_url: installUrl,
    steps: [
      '1. Visit the install URL above',
      '2. Install the app on your repository',
      '3. Create an issue or PR to test'
    ]
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 GitHub App (Modern JavaScript) running at http://localhost:${port}`);
  console.log(`📝 Required environment variables:`);
  console.log(`   - APP_ID: ${process.env.APP_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   - WEBHOOK_SECRET: ${process.env.WEBHOOK_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   - PRIVATE_KEY: ${process.env.PRIVATE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`\n🔗 To expose publicly, run: npx localtunnel --port 3000`);
});



