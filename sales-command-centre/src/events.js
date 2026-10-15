'use strict';

/** Server-sent events hub: the dashboard subscribes once and receives real backend state. */
function createEvents() {
  const clients = new Set();
  let heartbeat = null;
  let sequence = 0;

  function publish(type, payload = {}) {
    sequence++;
    const frame = `id: ${sequence}\nevent: ${type}\ndata: ${JSON.stringify({ ...payload, at: new Date().toISOString(), seq: sequence })}\n\n`;
    for (const res of clients) {
      try { res.write(frame); } catch { clients.delete(res); }
    }
  }

  function subscribe(req, res, { token = '' } = {}) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n\n`);
    clients.add(res);
    publish('connected', { clients: clients.size });
    req.on('close', () => clients.delete(res));
  }

  function start() {
    heartbeat = setInterval(() => { publish('heartbeat', { clients: clients.size }); }, 20000);
    heartbeat.unref?.();
  }

  function close() {
    if (heartbeat) clearInterval(heartbeat);
    for (const res of clients) { try { res.end(); } catch { /* already gone */ } }
    clients.clear();
  }

  return { publish, subscribe, start, close, clientCount: () => clients.size };
}

module.exports = { createEvents };
