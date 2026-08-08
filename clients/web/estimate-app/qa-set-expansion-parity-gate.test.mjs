import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGate, compareExpansion } from './qa-set-expansion-parity-gate.mjs';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

const result = runGate({ root });
assert.equal(result.passed, true);
assert.equal(result.differences.length, 0);

const golden = result.expected;
const mutated = structuredClone(golden);
mutated.single[0].parts[0].unitPrice += 1;
mutated.single[0].parts[0].subtotal += 1;
const differences = compareExpansion(result.actual, mutated);
assert.ok(differences.some((item) => item.field === 'unitPrice'));
