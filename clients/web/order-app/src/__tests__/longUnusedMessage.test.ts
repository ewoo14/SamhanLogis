import { describe, expect, it } from 'vitest';

declare const process: { cwd: () => string };
declare function require(id: string): any;

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

describe('장기미사용 안내문', () => {
  it('실제 판정 기준인 마지막 로그인 또는 비밀번호 변경일을 안내한다', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain('마지막 로그인일(로그인 기록이 없으면 비밀번호 변경일)로부터 30일간');
    expect(html).not.toContain('최종 주문일로부터 30일');
  });
});
