const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  expandHomeRemoteOption,
  normalizeRemoteOption,
  normalizePanelOption,
  resolveSingleRemoteOption,
  configuredOptionVariants,
  configuredOptionShapes,
  deriveInfinitePanelVariant,
} = require('../../option-naming/optionNaming');

test('D-03 옵션 명칭 DB 속성축 통일', async (t) => {
  await t.test('홈멀티 기본은 360·AR-CH01·벽걸이/기타 3갈래로 전개된다', () => {
    assert.deepEqual(expandHomeRemoteOption('기본', {
      counts: { cassette360: 2, chIndoor: 3, wallAndOther: 4 },
      models: { cassette360: 'R360', chIndoor: 'RCH', wireless: 'RW' },
    }), { R360: 2, RCH: 3, RW: 4 });
  });

  await t.test('홈멀티 기본은 무선 단일 모델로 축약되지 않는다', () => {
    assert.notDeepEqual(expandHomeRemoteOption('기본', {
      counts: { cassette360: 1, chIndoor: 1, wallAndOther: 1 },
      models: { cassette360: 'R360', chIndoor: 'RCH', wireless: 'RW' },
    }), { RW: 3 });
  });

  await t.test('신규·기존 리모컨 문자열을 공통 값으로 해석한다', () => {
    assert.deepEqual(['무선', '유선', '컬러', '제외', '기본'].map(normalizeRemoteOption), [
      '무선', '유선', '컬러', '제외', '기본',
    ]);
    assert.equal(normalizeRemoteOption('유선리모컨'), '유선');
    assert.equal(normalizeRemoteOption('컬러유선리모컨'), '컬러');
    assert.equal(normalizeRemoteOption('컬러유선'), '컬러');
  });

  await t.test('기존 판넬 문자열과 빈 문자열을 panel_type 축으로 해석한다', () => {
    assert.deepEqual(['', '기본판넬', '블랙판넬', '승강판넬', '공청판넬'].map(normalizePanelOption), [
      '기본', '기본', '블랙', '승강', '공청',
    ]);
  });

  await t.test('품목명에서 인피니트 판넬 4종을 구분한다', () => {
    const rows = [
      ['판넬 1way 무풍대형 인피니트', '일반', '인피니트 기본'],
      ['판넬 1way 무풍대형 인피니트 25년형', '일반', '인피니트 25년형'],
      ['판넬 1way 무풍대형 인피니트 / 공청', '공청', '인피니트 공청'],
      ['판넬 1way 무풍대형 인피니트 / 공청+동작감지', '공청', '인피니트 공청+동작감지 AI'],
    ];
    for (const [name, panelType, expected] of rows) {
      assert.equal(deriveInfinitePanelVariant(name, panelType), expected, name);
    }
  });

  await t.test('인피니트가 아닌 기존 판넬은 도출 대상이 아니다', () => {
    assert.equal(deriveInfinitePanelVariant('판넬 360 원형', '일반'), null);
    assert.equal(deriveInfinitePanelVariant('판넬 1way 일반 공청', '공청'), null);
  });

  await t.test('싱글은 리모컨 선택보다 제외를 우선한다', () => {
    assert.equal(resolveSingleRemoteOption('유선', false), '유선');
    assert.equal(resolveSingleRemoteOption('유선리모컨', false), '유선');
    assert.equal(resolveSingleRemoteOption('컬러유선리모컨', false), '컬러');
    assert.equal(resolveSingleRemoteOption('유선', true), '제외');
  });

  await t.test('구성품에 설정된 variant만 옵션 목록이 된다', () => {
    const rows = [
      { componentKind: 'REMOTE', componentVariant: '기본' },
      { componentKind: 'REMOTE', componentVariant: '컬러' },
      { componentKind: 'REMOTE', componentVariant: '기본' },
      { componentKind: 'PANEL', componentVariant: '블랙' },
    ];
    assert.deepEqual(configuredOptionVariants(rows, 'REMOTE'), ['기본', '컬러']);
    assert.deepEqual(configuredOptionVariants(rows, 'PANEL'), ['블랙']);
    assert.deepEqual(configuredOptionVariants(rows, 'MATERIAL'), []);
  });

  await t.test('360 판넬 모양도 component_shape만 옵션 목록이 된다', () => {
    assert.deepEqual(configuredOptionShapes([
      { componentKind: 'PANEL', componentShape: '원형' },
      { componentKind: 'PANEL', componentShape: '사각' },
      { componentKind: 'PANEL', componentShape: null },
      { componentKind: 'PANEL', componentShape: '원형' },
    ]), ['원형', '사각']);
    assert.deepEqual(configuredOptionShapes([
      { componentKind: 'PANEL', componentVariant: '원형' },
    ]), []);
  });

  await t.test('세 화면 소스가 공통 명칭과 홈 기본 분기를 보존한다', () => {
    const estimate = fs.readFileSync(path.resolve(__dirname, '../views/index.ejs'), 'utf8');
    const order = fs.readFileSync(path.resolve(__dirname, '../../order-app/index.html'), 'utf8');
    for (const source of [estimate, order]) {
      assert.match(source, /sel\('리모컨'/);
      assert.match(source, /컬러유선/);
      assert.match(source, /opt\s*===\s*'기본'/);
      assert.match(source, /REMOTE_360_DEFAULT/);
      assert.match(source, /R_CH|REMOTE_INF_DEFAULT/);
      assert.match(source, /REMOTE_WIRELESS/);
      assert.match(source, /d03ConfiguredVariants_/);
      assert.match(source, /d03ConfiguredShapes_/);
      assert.doesNotMatch(source, /sel\('360판넬',\s*\['원형',\s*'사각'\]/);
    }
  });
});
