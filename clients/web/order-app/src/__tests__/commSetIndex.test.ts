import { describe, expect, it } from 'vitest';

declare const process: { cwd: () => string };
declare function require(id: string): any;

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

function loadCommSetIndexRuntime() {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const start = html.indexOf('// 세트 키 정규화');
  const end = html.indexOf('// 세트 미리보기 분해');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('legacy comm set index block not found');
  }

  const context = {
    window: {} as Record<string, unknown>,
    COMM_PARTS: [
      {
        세트: 'SET-A',
        모델명: 'PART-1',
        품목명: '구성품 1',
        수량: '2',
        단위: 'EA',
        출고가: '12345',
      },
    ],
  };
  vm.createContext(context);
  vm.runInContext(
    `${html.slice(start, end)}; globalThis.__BUILD_COMM_SET_INDEX__ = buildCommSetIndex;`,
    context,
  );
  return context as typeof context & {
    __BUILD_COMM_SET_INDEX__: () => Map<string, Array<Record<string, unknown>>>;
  };
}

describe('legacy order-app commercial set index', () => {
  it('COMM_PARTS 전역 주입만으로 상업 SET 구성품 인덱스를 생성한다', () => {
    const runtime = loadCommSetIndexRuntime();

    const index = runtime.__BUILD_COMM_SET_INDEX__();

    expect(index.size).toBe(1);
    expect(index.get('SET-A')).toEqual([
      {
        model: 'PART-1',
        name: '구성품 1',
        qty: 2,
        unit: 'EA',
        price: 12345,
      },
    ]);
  });
});
