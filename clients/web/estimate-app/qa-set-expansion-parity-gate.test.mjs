import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGate, compareExpansion } from './qa-set-expansion-parity-gate.mjs';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

const result = runGate({ root });
assert.equal(result.passed, true);
assert.equal(result.differences.length, 0);
assert.equal(result.scope.outOfScopeTabs.length, 21);

const baseline = structuredClone(result.actual);
assert.equal(compareExpansion(result.actual, baseline).length, 0);

const priceMutation = structuredClone(baseline);
priceMutation.single[0].parts[0].unitPrice += 1;
priceMutation.single[0].parts[0].subtotal += 1;
const differences = compareExpansion(result.actual, priceMutation);
assert.ok(differences.some((item) => item.field === 'unitPrice'));
