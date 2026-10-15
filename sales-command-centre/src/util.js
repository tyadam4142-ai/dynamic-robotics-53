'use strict';
const crypto = require('crypto');

const id = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const IST_OFFSET_MS = 19800000; // Asia/Kolkata is UTC+05:30 year-round (no DST).
const SECRET_KEY_RE = /(key|token|secret|password|passwd|credential|authorization|cookie|apikey)/i;

function str(value, max = 200) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function mergeDeep(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? deepClone(base) : deepClone(override);
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = isPlainObject(base[key]) && isPlainObject(override[key]) ? mergeDeep(base[key], override[key]) : deepClone(override[key]);
  }
  return out;
}

function redact(value, depth = 0) {
  if (depth > 6) return '[deep]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY_RE.test(k) ? (v ? '[redacted]' : v) : redact(v, depth + 1);
  }
  return out;
}

/** Normalise to E.164. Bare 10-digit numbers are treated as Indian mobile numbers. */
function normalizePhone(raw) {
  let n = str(raw, 30).replace(/[\s()\-.]/g, '');
  if (!n) return { phone: '', error: 'A phone number is required.' };
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) {
    if (/^\d{10}$/.test(n)) n = '+91' + n;
    else if (/^91\d{10}$/.test(n)) n = '+91' + n.slice(2);
    else return { phone: '', error: 'Enter a valid number in international format, e.g. +919876543210.' };
  }
  if (!/^\+[1-9]\d{7,14}$/.test(n)) return { phone: '', error: 'That number is not a valid E.164 phone number.' };
  return { phone: n, error: null };
}

function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email);
}

function istDate(d = new Date()) {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}
function fmtIst(d) {
  return `${new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`;
}
function istParts(d) {
  const iso = new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), hour: Number(iso.slice(11, 13)) };
}
function fromIst(date, time) {
  return new Date(`${date}T${time}:00+05:30`);
}
function isIstDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && istParts(fromIst(date, '00:00')).date === date;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** RFC-4180-ish CSV reader: handles quoted fields, escaped quotes and CRLF. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = String(text || '').replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  row.push(field);
  rows.push(row);
  const header = (rows.shift() || []).map((h) => str(h, 60).toLowerCase().replace(/^/, ''));
  if (!header.length) return [];
  return rows
    .filter((r) => r.some((cell) => str(cell) !== ''))
    .map((r) => {
      const o = {};
      header.forEach((h, j) => { if (h) o[h] = str(r[j], 4000); });
      return o;
    });
}

function csvCell(value) {
  let v = String(value ?? '');
  if (/^[=+\-@]/.test(v)) v = "'" + v; // neutralise CSV formula injection
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function toCsv(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {});
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}

/** Minimal JSON-Schema validator (object/array/scalars, required, enum, bounds, pattern, defaults). */
function validate(schema, value, label = 'input') {
  const errors = [];
  const out = walk(schema, value, label);
  return errors.length ? { ok: false, error: errors.join(' '), value: null } : { ok: true, error: null, value: out };

  function fail(message) { errors.push(message); return undefined; }
  function walk(node, val, path) {
    if (node.type === 'object') {
      if (!isPlainObject(val)) return fail(`${path} must be an object.`);
      const required = node.required || [];
      const result = {};
      for (const key of required) {
        if (val[key] === undefined || val[key] === null || val[key] === '') fail(`${path}.${key} is required.`);
      }
      for (const [key, sub] of Object.entries(node.properties || {})) {
        if (val[key] === undefined || val[key] === null) {
          if (sub.default !== undefined) result[key] = deepClone(sub.default);
          continue;
        }
        const v = walk(sub, val[key], `${path}.${key}`);
        if (v !== undefined) result[key] = v;
      }
      return result;
    }
    if (node.type === 'array') {
      if (!Array.isArray(val)) return fail(`${path} must be an array.`);
      const max = node.maxItems || 200;
      if (val.length > max) return fail(`${path} may contain at most ${max} items.`);
      return val.map((item, i) => walk(node.items || { type: 'string' }, item, `${path}[${i}]`)).filter((v) => v !== undefined);
    }
    if (node.type === 'string') {
      if (typeof val !== 'string') return fail(`${path} must be text.`);
      const v = val.trim().slice(0, node.maxLength || 4000);
      if (!v && (node.minLength || 1) > 0) return fail(`${path} must not be empty.`);
      if (node.enum && !node.enum.includes(v)) return fail(`${path} must be one of: ${node.enum.join(', ')}.`);
      if (node.pattern && !new RegExp(node.pattern).test(v)) return fail(`${path} has an invalid format.`);
      if (v.length < (node.minLength || 0)) return fail(`${path} is too short.`);
      return v;
    }
    if (node.type === 'integer' || node.type === 'number') {
      const n = typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val.trim()) ? Number(val) : val;
      if (typeof n !== 'number' || Number.isNaN(n)) return fail(`${path} must be a number.`);
      if (node.type === 'integer' && !Number.isInteger(n)) return fail(`${path} must be a whole number.`);
      if (node.minimum !== undefined && n < node.minimum) return fail(`${path} must be at least ${node.minimum}.`);
      if (node.maximum !== undefined && n > node.maximum) return fail(`${path} must be at most ${node.maximum}.`);
      return n;
    }
    if (node.type === 'boolean') {
      if (typeof val === 'string' && /^(true|false)$/.test(val)) return val === 'true';
      if (typeof val !== 'boolean') return fail(`${path} must be true or false.`);
      return val;
    }
    return val;
  }
}

module.exports = {
  id, nowIso, str, deepClone, isPlainObject, mergeDeep, redact, normalizePhone, isValidEmail,
  fmtIst, istParts, istDate, fromIst, isIstDate, escapeHtml, parseCsv, toCsv, validate,
  IST_OFFSET_MS, SECRET_KEY_RE,
};
