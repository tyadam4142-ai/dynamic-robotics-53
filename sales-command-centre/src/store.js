'use strict';
const fs = require('fs');
const path = require('path');
const { id, nowIso, deepClone } = require('./util');

/**
 * Every collection is read-modify-written through a per-collection promise chain so
 * concurrent requests cannot clobber each other's updates, and each write lands via
 * tmp-file + rename so a crash cannot leave a half-written JSON document.
 */
const COLLECTIONS = {
  meta: { shape: 'object', default: () => ({ schemaVersion: 0 }) },
  settings: { shape: 'object', default: () => ({}) },
  products: { shape: 'array', default: () => [] },
  customers: { shape: 'array', default: () => [] },
  conversations: { shape: 'array', default: () => [] },
  runs: { shape: 'array', default: () => [], cap: 800, newestFirst: true },
  tasks: { shape: 'array', default: () => [], cap: 8000 },
  campaigns: { shape: 'array', default: () => [] },
  approvals: { shape: 'array', default: () => [], cap: 800 },
  calls: { shape: 'array', default: () => [], cap: 3000, newestFirst: true },
  voice_sessions: { shape: 'array', default: () => [], cap: 800, newestFirst: true },
  messages: { shape: 'array', default: () => [], cap: 4000, newestFirst: true },
  callbacks: { shape: 'array', default: () => [], cap: 2000 },
  followups: { shape: 'array', default: () => [], cap: 2000 },
  activities: { shape: 'array', default: () => [], cap: 3000, newestFirst: true },
  logs: { shape: 'array', default: () => [], cap: 4000, newestFirst: true },
};

const SCHEMA_VERSION = 6;

class Store {
  constructor(dir) {
    this.dir = dir;
    this.chains = new Map();
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
    this.recovered = [];
    this.#runMigrations();
  }

  file(name) { return path.join(this.dir, `${name}.json`); }
  definition(name) { return COLLECTIONS[name]; }

  #readUnlocked(name) {
    const def = COLLECTIONS[name] || { shape: 'array', default: () => [] };
    const file = this.file(name);
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (def.shape === 'object') return def.default().constructor === Object && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : def.default();
      return Array.isArray(parsed) ? parsed : def.default();
    } catch (e) {
      if (e.code !== 'ENOENT') {
        try {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          fs.renameSync(file, path.join(this.dir, 'backups', `${name}.corrupt.${stamp}.json`));
          this.recovered.push(name);
        } catch { /* unreadable file left in place */ }
      }
      return deepClone(def.default());
    }
  }

  #writeUnlocked(name, value) {
    const file = this.file(name);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  }

  #lock(name, job) {
    const previous = this.chains.get(name) || Promise.resolve();
    const next = previous.then(job, job);
    this.chains.set(name, next.then(() => undefined, () => undefined));
    return next;
  }

  read(name) {
    const def = COLLECTIONS[name];
    if (def && def.shape === 'array') return this.#lock(name, () => deepClone(this.#readUnlocked(name)));
    return this.#lock(name, () => deepClone(this.#readUnlocked(name)));
  }

  /**
   * update(name, fn) — fn(currentValue) returns either a new value, or
   * { value, result } to persist `value` and resolve with `result`.
   */
  update(name, fn) {
    return this.#lock(name, () => {
      const current = this.#readUnlocked(name);
      const out = fn(deepClone(current));
      let value = out, result;
      if (out && typeof out === 'object' && !Array.isArray(out) && 'value' in out && 'result' in out) { value = out.value; result = out.result; }
      const def = COLLECTIONS[name];
      if (def && def.shape === 'array' && Array.isArray(value) && def.cap && value.length > def.cap) {
        value = def.newestFirst === false ? value.slice(value.length - def.cap) : value.slice(0, def.cap);
      }
      this.#writeUnlocked(name, value);
      return result === undefined ? deepClone(value) : deepClone(result);
    });
  }

  /** Append at the head (newest-first collections). */
  prepend(name, record, capOverride) {
    return this.update(name, (rows) => {
      rows.unshift(record);
      const cap = capOverride || (COLLECTIONS[name] && COLLECTIONS[name].cap) || 1000;
      return rows.slice(0, cap);
    });
  }

  push(name, record) {
    return this.update(name, (rows) => { rows.push(record); return rows; });
  }

  find(name, predicate) {
    return this.read(name).then((rows) => (Array.isArray(rows) ? rows.find(predicate) : undefined));
  }

  snapshot() {
    const out = { takenAt: nowIso(), schemaVersion: SCHEMA_VERSION, collections: {} };
    for (const name of Object.keys(COLLECTIONS)) out.collections[name] = fs.existsSync(this.file(name)) ? this.#readUnlocked(name) : COLLECTIONS[name].default();
    return out;
  }

  backup(label = 'manual') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(this.dir, 'backups', `snapshot.${label}.${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(this.snapshot(), null, 2));
    return file;
  }

  listBackups() {
    const dir = path.join(this.dir, 'backups');
    try {
      return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return { name: f, bytes: stat.size, at: stat.mtime.toISOString() };
      }).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
    } catch { return []; }
  }

  #runMigrations() {
    const meta = this.#readUnlocked('meta');
    const from = Number(meta.schemaVersion || 0);
    if (from >= SCHEMA_VERSION) return;
    if (from < SCHEMA_VERSION) this.#migrateCustomers();
    this.#writeUnlocked('meta', { schemaVersion: SCHEMA_VERSION, migratedAt: nowIso(), previousVersion: from, installId: meta.installId || id() });
  }

  /** v0.5.0 records only carried name/phone/email/product/status/notes. */
  #migrateCustomers() {
    const file = this.file('customers');
    if (!fs.existsSync(file)) return;
    let rows;
    try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
    if (!Array.isArray(rows)) return;
    const migrated = rows.map((c) => ({
      id: c.id || id(),
      name: c.name || 'Unnamed',
      phone: c.phone || '',
      email: c.email || '',
      company: c.company || '',
      source: c.source || 'Legacy import',
      status: ['New', 'Contacted', 'Interested', 'Follow-up Required', 'Callback Scheduled', 'Converted', 'Not Interested'].includes(c.status) ? c.status : 'New',
      interestLevel: c.interestLevel ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      notes: c.notes || '',
      consent: c.consent || { contactApproved: false, channels: [], optOut: false, evidence: '' },
      preferredChannel: c.preferredChannel || 'any',
      product: c.product || '',
      lastContactAt: c.lastContactAt || null,
      lastCallOutcome: c.lastCallOutcome || '',
      lastMessageAt: c.lastMessageAt || null,
      lastMessagePreview: c.lastMessagePreview || '',
      nextFollowUpAt: c.nextFollowUpAt || null,
      assignedAgent: c.assignedAgent || 'me',
      attemptCount: Number(c.attemptCount || 0),
      createdAt: c.createdAt || nowIso(),
      updatedAt: nowIso(),
    }));
    const tmp = `${file}.migrating`;
    fs.writeFileSync(tmp, JSON.stringify(migrated, null, 2));
    fs.renameSync(tmp, file);
  }
}

module.exports = { Store, COLLECTIONS, SCHEMA_VERSION };
