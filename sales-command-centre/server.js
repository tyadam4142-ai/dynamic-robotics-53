'use strict';
const path = require('path');
const fs = require('fs');

const { createApp, loadLocalEnv } = require('./src/app');
const { VERSION } = require('./src/config');
const { integrationStatus } = require('./src/config');

function runtimeConfig(env = process.env) {
  const port = Number(env.PORT || 3053);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a whole number between 1 and 65535.');
  const dataDir = env.DR53_DATA_DIR
    ? (path.isAbsolute(env.DR53_DATA_DIR) ? path.resolve(env.DR53_DATA_DIR) : path.resolve(__dirname, env.DR53_DATA_DIR))
    : path.join(__dirname, 'data');
  return { port, host: env.HOST || '127.0.0.1', dataDir };
}

async function main() {
  loadLocalEnv(__dirname);
  const { port, host, dataDir } = runtimeConfig();
  if (!fs.existsSync(path.join(__dirname, '.env'))) {
    console.log('No .env file yet — running with local-only defaults. Copy .env.example to .env to add credentials.');
  }

  const app = createApp(dataDir);
  await app.init();

  const line = (s = '') => console.log(s);
  const server = app.server;

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      line(`\nPort ${port} is already in use.`);
      line('Either DR53 is already running (open http://127.0.0.1:' + port + ') or another app holds it.');
      line('Close the other process after identifying it, or start DR53 elsewhere: PORT=3060 ./scripts/start.sh');
      process.exit(1);
    }
    if (e.code === 'EACCES') { line(`Port ${port} needs administrator rights. Use a port above 1024.`); process.exit(1); }
    line(`Server error: ${e.message}`);
    process.exit(1);
  });

  await app.listen(port, host);
  app.boot();

  const settings = app.getSettings();
  const providers = integrationStatus(process.env);
  const ai = await app.reports.modelStatus(true);

  line('');
  line(`  DR53 AI Sales Agent v${VERSION} — Command Centre`);
  line('  ' + '-'.repeat(56));
  line(`  Dashboard   http://${host}:${port}`);
  line(`  Data        ${dataDir}`);
  line(`  Business    ${settings.business.name}`);
  line(`  AI model    ${ai.ready ? ai.activeLabel : 'NOT READY'}${ai.message ? ` (${ai.message})` : ''}`);
  line(`  Voice mode  ${settings.voice.mode === 'local' ? 'local Mac assist (free)' : 'provider calls'} — AI voice calls ${providers.aiVoiceCall.ready ? 'configured' : `need: ${providers.aiVoiceCall.missing.join(', ') || 'see SETUP.md'}`}`);
  line(`  Messaging   SMS ${providers.sms.ready ? 'ready' : 'not configured'} · WhatsApp ${providers.whatsapp.ready ? 'ready' : 'not configured'}`);
  line(`  Native Mac  dialer/Messages ${providers.nativeMac.ready ? 'available' : 'not available on this OS'}`);
  line(`  Safety      kill switch ${settings.agent.killSwitch ? 'ON' : 'off'} · auto-execute ${settings.agent.autoExecute ? 'on' : 'ask first'} · approvals ${settings.agent.requireApprovalForConsequential ? 'required for outbound' : 'off'}${process.env.DR53_ACCESS_TOKEN ? ' · access token set' : ' · no access token'}`);
  line('');
  line('  Ctrl+C stops the app. Pending tasks resume on the next start.');
  line('');

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    line(`\nStopping (${signal}) — letting in-flight tasks finish…`);
    try { await app.queue.stop(); } catch { /* ignore */ }
    try { app.events.close(); } catch { /* ignore */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`[dr53] background promise rejected: ${message}`);
    try { app.log('error', `unhandledRejection: ${message.slice(0, 200)}`); } catch { /* ignore */ }
  });
  process.on('uncaughtException', (error) => {
    console.error(`[dr53] unexpected error: ${error.stack || error.message}`);
    try { app.log('error', `uncaughtException: ${String(error.message).slice(0, 200)}`); } catch { /* ignore */ }
  });
}

if (require.main === module) main().catch((e) => { console.error(`DR53 could not start: ${e.message}`); process.exit(1); });

module.exports = { main, runtimeConfig };
