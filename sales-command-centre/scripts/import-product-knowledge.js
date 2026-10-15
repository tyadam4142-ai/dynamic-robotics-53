#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const cataloguePath = path.join(root, 'knowledge', 'product-catalogue.json');
const dataPath = path.join(root, 'data', 'products.json');
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
fs.mkdirSync(path.dirname(dataPath), { recursive: true });
let current = [];
if (fs.existsSync(dataPath)) {
  try { current = JSON.parse(fs.readFileSync(dataPath, 'utf8')); if (!Array.isArray(current)) current = []; }
  catch { throw new Error(`Could not parse ${dataPath}; fix the file before importing. No changes made.`); }
}
if (current.length && fs.existsSync(dataPath)) {
  const backup = `${dataPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(dataPath, backup);
  console.log(`Backup created: ${path.relative(root, backup)}`);
}
const byId = new Map(current.map(p => [p.id, p]));
for (const incoming of catalogue.products) {
  const old = byId.get(incoming.id);
  // Update approved facts, but preserve an operator's explicit active/inactive choice.
  byId.set(incoming.id, { ...incoming, ...(old || {}), ...incoming, active: old && old.active === false ? false : incoming.active });
}
const knownIds = new Set(catalogue.products.map(p => p.id));
const merged = [...catalogue.products.map(p => byId.get(p.id)), ...current.filter(p => !knownIds.has(p.id))];
fs.writeFileSync(dataPath, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
console.log(`Imported ${catalogue.products.length} approved DR53 products into data/products.json.`);
console.log('Existing custom products were preserved. Restart DR53 to reload the catalogue.');
