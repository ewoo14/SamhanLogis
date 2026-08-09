import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveQaShotsDir } from './lib/qa-shots-dir.mjs';

const root = process.cwd();
const committedOutputDir = path.join(root, 'docs', 'qa', '896-p0-golden-manifest');
const outputDir = resolveQaShotsDir(committedOutputDir);
const goldenDir = path.join(outputDir, 'golden');
// Manifest에 기록하는 논리 경로는 POSIX 구분자를 고정한다. 파일 접근 시에만
// path.join(root, baselineDir, ...)으로 호스트 OS의 물리 경로로 변환한다.
const baselineDir = 'docs/qa/896-parity-run2/sheet/run2';
const formulaDir = 'docs/dev-reports/896-gas-formula-agg';
const goldenFiles = [
  '01-catalog-and-categories.json',
  '02-set-expansion.json',
  '03-options-features-defaults.json',
  '04-quantity-derived.json',
  '05-price-scenarios.json',
  '06-toggle-off-on.json',
];
const sourceTabs = {
  HOME_MULTI: '홈멀티',
  SINGLE_SET: '싱글 세트',
  SINGLE_COMPONENT: '싱글 구성품',
  COMMERCIAL_MULTI: '상업멀티',
  COMMERCIAL_COMPONENT: '상업멀티 구성',
  OLD_PRODUCT: '구형',
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(relativePath, value) {
  const filePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function jsonPath(parts) {
  return `$${parts.map((part) => `[${JSON.stringify(part)}]`).join('')}`;
}

fs.mkdirSync(goldenDir, { recursive: true });
for (const file of goldenFiles) {
  fs.copyFileSync(path.join(root, baselineDir, file), path.join(goldenDir, file));
}

const catalog = readJson(`${baselineDir}/01-catalog-and-categories.json`);
const expansion = readJson(`${baselineDir}/02-set-expansion.json`);
const features = readJson(`${baselineDir}/03-options-features-defaults.json`);
const quantity = readJson(`${baselineDir}/04-quantity-derived.json`);
const prices = readJson(`${baselineDir}/05-price-scenarios.json`);
const toggles = readJson(`${baselineDir}/06-toggle-off-on.json`);
const items = readJson(`${formulaDir}/items.json`);
const groups = readJson(`${formulaDir}/groups.json`);

const modelSet = new Set();
const setModelSet = new Set();
const specStats = {};
for (const [index, row] of catalog.rows.entries()) {
  if (row.model) modelSet.add(row.model);
  if (row.setModel) setModelSet.add(row.setModel);
  for (const key of ['capacity', 'spec', 'note']) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value) !== '') {
      specStats[key] ??= { nonEmpty: 0, distinctValues: new Set() };
      specStats[key].nonEmpty += 1;
      specStats[key].distinctValues.add(String(value));
    }
  }
}

const groupStatusCounts = Object.fromEntries(
  ['DATA_OK', 'DATA_PARTIAL', 'CODE_ONLY', 'UNKNOWN'].map((status) => [
    status,
    groups.filter((group) => group.dyn === status).length,
  ]),
);

const sourceRecords = [];
for (const [index, row] of catalog.rows.entries()) {
  sourceRecords.push({
    recordType: 'catalog-row',
    sourceFile: `${baselineDir}/01-catalog-and-categories.json`,
    sourceTab: sourceTabs[row.source] ?? null,
    sourceRow: index + 1,
    model: row.model || null,
    setModel: row.setModel || null,
    feature: row.feature || null,
    priceVariant: 'canonical-structure',
    rawCells: row,
    sourceSha256: sha256(path.join(root, baselineDir, '01-catalog-and-categories.json')),
    jsonPath: jsonPath(['rows', index]),
  });
}

for (const [index, feature] of features.componentFeatures.entries()) {
  sourceRecords.push({
    recordType: 'component-feature',
    sourceFile: `${baselineDir}/03-options-features-defaults.json`,
    sourceTab: feature.setModel ? '싱글 구성품' : null,
    sourceRow: index + 1,
    model: feature.model || null,
    setModel: feature.setModel || null,
    feature: feature.feature || null,
    priceVariant: 'canonical-structure',
    rawCells: feature,
    sourceSha256: sha256(path.join(root, baselineDir, '03-options-features-defaults.json')),
    jsonPath: jsonPath(['componentFeatures', index]),
  });
}

function buildManifest() {
  return {
  schemaVersion: 1,
  purpose: '#896 P0 골든·열 계약·적재 manifest 고정',
  reproducibility: {
    command: 'node scripts/generate-896-p0-golden-manifest.mjs',
    outputDirectory: 'docs/qa/896-p0-golden-manifest',
    pathsAreRelative: true,
    dynamicValues: false,
  },
  inputTotals: {
    gasFormulaItems: 3392,
    gasFormulaGroups: 2649,
    gasFormulaSubstantiveGroups: 2648,
    mainSheetTabs: 27,
    codeReadTabs: 17,
    catalogReferenceModels: 1118,
    priceCells: 8094,
    catalogRowsInStoredGolden: catalog.rows.length,
    specKeyValueCountsFromStoredGolden: Object.fromEntries(
      Object.entries(specStats).map(([key, value]) => [key, {
        nonEmpty: value.nonEmpty,
        distinctValues: value.distinctValues.size,
      }]),
    ),
  },
  formulaInventory: {
    items: { count: items.length, sourceFile: `${formulaDir}/items.json`, sha256: sha256(path.join(root, formulaDir, 'items.json')) },
    groups: { count: groups.length, sourceFile: `${formulaDir}/groups.json`, sha256: sha256(path.join(root, formulaDir, 'groups.json')) },
    groupStatusCounts,
    expectedGroupStatusCounts: { DATA_OK: 524, DATA_PARTIAL: 551, CODE_ONLY: 1560, UNKNOWN: 14 },
  },
  columnContract: {
    catalog: ['source', 'index', 'model', 'name', 'unit', 'price', 'list', 'categoryLarge', 'categoryMedium', 'categorySmall', 'capacity', 'spec', 'note', 'setModel', 'kind', 'feature', 'isDefault', 'componentQuantity', 'variablePrice', 'fixedDiscount'],
    setComponent: ['model', 'name', 'kind', 'feature', 'isDefault', 'unit', 'quantity', 'unitPrice', 'subtotal', 'spec'],
    feature: ['setModel', 'model', 'name', 'kind', 'feature', 'isDefault'],
    priceScenario: ['id', 'input', 'configured', 'selectedOptions', 'result'],
    toggle: ['schemaVersion', 'purpose', 'catalogSource', 'input', 'off', 'on'],
    provenance: ['sourceFile', 'sourceTab', 'sourceRow', 'model', 'setModel', 'feature', 'priceVariant', 'rawCells', 'sourceSha256', 'jsonPath'],
  },
  golden: goldenFiles.map((file) => ({
    file: `golden/${file}`,
    sourceFile: `${baselineDir}/${file}`,
    sha256: sha256(path.join(goldenDir, file)),
  })),
  storedGoldenShape: {
    catalogRows: catalog.rows.length,
    singleSetRows: expansion.single.length,
    commercialSetRows: expansion.commercial.length,
    componentFeatureRows: features.componentFeatures.length,
    quantityInputs: Object.keys(quantity.home.inputs).length + Object.keys(quantity.commercial.inputs).length,
    priceScenarios: prices.scenarios.length,
    toggleSchemaVersion: toggles.schemaVersion,
  },
  sourceManifest: {
    recordFile: 'input-manifest.jsonl',
    recordCount: sourceRecords.length,
    recordsHaveCoordinates: sourceRecords.every((record) => record.sourceFile && record.sourceRow && record.jsonPath),
    rawGoogleSheetSnapshotPresent: false,
    note: '저장소에 이미 있는 기준선 JSON의 행/JSON 좌표를 고정했다. 원시 Google Sheets 셀 스냅샷은 이 라운드에서 새로 읽지 않았다.',
  },
  };
}

const manifest = buildManifest();

const manifestLines = sourceRecords.map((record) => JSON.stringify(record)).join('\n') + '\n';
fs.writeFileSync(path.join(outputDir, 'input-manifest.jsonl'), manifestLines, 'utf8');
const sums = manifest.golden.map((entry) => `${entry.sha256}  ${entry.file}`).join('\n') + '\n';
fs.writeFileSync(path.join(outputDir, 'golden', 'SHA256SUMS.txt'), sums, 'utf8');
writeJson(path.join(outputDir, 'manifest.json'), manifest);

console.log(JSON.stringify({
  outputDirectory: 'docs/qa/896-p0-golden-manifest',
  goldenFiles: manifest.golden,
  manifestSha256: sha256(path.join(outputDir, 'manifest.json')),
  inputManifestSha256: sha256(path.join(outputDir, 'input-manifest.jsonl')),
  sourceRecords: sourceRecords.length,
  groupStatusCounts,
}, null, 2));
