import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { evaluateSingleS03Rule, selectSingleS03Rule } from '../src/quantitySync.ts';

const require = createRequire(import.meta.url);
const { evaluateLegacyQuantityBoundary } = require('../../legacy-quantity-golden/legacyQuantityBoundary');
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, '../src/__tests__/fixtures/singleSetsBootstrap.fixture.json'), 'utf8'));
const rows = fixture.rows;
const source = rows.find((row) => row.id === '싱글 실링61');
const target = rows.find((row) => row.model === 'ADP-F075SP');
const rule = {
  ruleKey: 'SINGLE_S03_CEILING_DRAIN_PUMP',
  legacyRef: 'S-03',
  estimateCategory: 'SINGLE_SET',
  enabled: true,
  aggregation: 'SUM',
  when: {},
  inactiveBehavior: 'ZERO',
  sources: [{ productCode: source.model, factor: 1 }],
  targets: [{ productCode: target.model, multiplier: 1, roundingMode: 'NONE', displayOrder: 1 }],
};
const selected = selectSingleS03Rule([rule], rows);
if (selected.status !== 'ready') throw new Error(selected.errorMessage || 'S-03 rule selection failed');

const unitPrice = 8958400 / 77;
const results = [0, 1, 4, 77].map((sourceQuantity) => {
  const before = evaluateLegacyQuantityBoundary({
    app: 'order',
    family: `S-03-shadow-${sourceQuantity}`,
    catalog: { home: [], single: rows, singleParts: [], commercial: [] },
    sourceQuantities: { [source.id]: sourceQuantity },
    options: { dom: {} },
    manualLocks: { single: {} },
  });
  const beforeQuantity = Number(before.quantities[target.id] || 0);
  const after = evaluateSingleS03Rule(selected.rule, rows, new Map([[source.id, sourceQuantity]]));
  const afterQuantity = Number(after.targetQuantities.get(target.id) || 0);
  const beforeSubtotal = beforeQuantity * unitPrice;
  const afterSubtotal = afterQuantity * unitPrice;
  const beforePayload = beforeQuantity > 0 ? [{ section: 'SINGLE', model: target.model, qty: beforeQuantity }] : [];
  const afterPayload = afterQuantity > 0 ? [{ section: 'SINGLE', model: target.model, qty: afterQuantity }] : [];
  if (beforeQuantity !== afterQuantity || beforeSubtotal !== afterSubtotal
    || JSON.stringify(beforePayload) !== JSON.stringify(afterPayload)) {
    throw new Error(JSON.stringify({ sourceQuantity, beforeQuantity, afterQuantity, beforeSubtotal, afterSubtotal, beforePayload, afterPayload }));
  }
  return { sourceQuantity, beforeQuantity, afterQuantity, beforeSubtotal, afterSubtotal, beforePayload, afterPayload };
});

console.log(JSON.stringify({
  fixture: {
    fetchedOn: fixture.source.fetchedOn,
    source: { id: source.id, model: source.model, name: source.name },
    target: { id: target.id, model: target.model, name: target.name },
  },
  rule: {
    ruleKey: rule.ruleKey,
    sourceProductCode: rule.sources[0].productCode,
    targetProductCode: rule.targets[0].productCode,
    factor: rule.sources[0].factor,
    multiplier: rule.targets[0].multiplier,
    inactiveBehavior: rule.inactiveBehavior,
  },
  selectedStatus: selected.status,
  results,
}));
