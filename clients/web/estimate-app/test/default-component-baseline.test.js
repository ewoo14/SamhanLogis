'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} 함수를 찾을 수 없습니다.`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} 함수 본문을 닫을 수 없습니다.`);
}

function loadBaselineHelpers(parts, domValues = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
  const context = {
    partsForSetStrict_: () => parts,
    el: (selector) => (selector in domValues ? { value: domValues[selector] } : null),
  };
  const helpers = [
    'componentVariant_',
    'isDefaultComponent_',
    'getDefaultRemoteRows',
    'getBasePanelRow',
    'pickPanelRow',
  ].map((name) => extractFunctionSource(source, name)).join('\n');

  vm.runInNewContext(`${helpers}
    this.getDefaultRemoteRows = getDefaultRemoteRows;
    this.getBasePanelRow = getBasePanelRow;
    this.pickPanelRow = pickPanelRow;`, context);

  return context;
}

describe('estimate-app 기본 구성품 baseline 판정', () => {
  test('리모컨 기본 행은 feat 문자열이 없어도 isDefault=true 를 우선 사용한다', () => {
    const helpers = loadBaselineHelpers([
      { model: 'REMOTE-BASE', kind: 'REMOTE', name: '유선 리모컨', feat: '', isDefault: true },
      { model: 'REMOTE-OPT', kind: 'REMOTE', name: '컬러 리모컨', feat: '컬러유선리모컨', isDefault: false },
    ]);

    expect(helpers.getDefaultRemoteRows({ model: 'SET-1' }).map((row) => row.model)).toEqual(['REMOTE-BASE']);
  });

  test('판넬 기본 행은 isDefault=true 를 우선 사용하고 legacy feat=기본도 fallback 한다', () => {
    const booleanHelpers = loadBaselineHelpers([
      { model: 'PNL-BASE', kind: 'PANEL', name: '일반 판넬', feat: '', isDefault: true },
      { model: 'PNL-BLACK', kind: 'PANEL', name: '블랙 판넬', feat: '블랙', isDefault: false },
    ]);
    expect(booleanHelpers.getBasePanelRow({ model: 'SET-1' }).model).toBe('PNL-BASE');
    expect(booleanHelpers.pickPanelRow({ model: 'SET-1' }).model).toBe('PNL-BASE');

    const legacyHelpers = loadBaselineHelpers([
      { model: 'PNL-LEGACY', kind: 'PANEL', name: '기존 판넬', feat: '기본' },
    ]);
    expect(legacyHelpers.getBasePanelRow({ model: 'SET-1' }).model).toBe('PNL-LEGACY');
  });
});
