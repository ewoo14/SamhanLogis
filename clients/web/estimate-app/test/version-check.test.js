'use strict';

const {
  buildVersionCheckUrl,
  fetchWebVersionStatus,
  hasUnsavedFormInput,
  resolveBuildAppVersion,
  resolveVersionPromptState,
} = require('../lib/version-check');

describe('종합견적 웹 버전 확인 계약', () => {
  test('종합견적 웹 식별자만 포함한 공개 버전 URL을 만든다', () => {
    expect(buildVersionCheckUrl('http://localhost:8080/', '2026/07/26-928')).toBe(
      'http://localhost:8080/app/version?clientType=SAMHAN_ESTIMATE_WEB&currentVersion=2026%2F07%2F26-928',
    );
  });

  test('릴리스 응답은 사용자 안내 상태로 변환한다', () => {
    expect(resolveVersionPromptState({
      latestVersion: '2026/07/26-929',
      minSupportedVersion: '2026/07/25-1',
      forceLevel: 'MAJOR',
      releaseNotes: '견적서 개선',
      releasedAt: '2026-07-26T09:00:00+09:00',
    }, new Map())).toMatchObject({ kind: 'recommend', latestVersion: '2026/07/26-929' });
  });

  test('404와 네트워크 실패는 정책 미수신 예외로 드러난다', async () => {
    await expect(fetchWebVersionStatus({
      apiBaseUrl: 'http://localhost:8080',
      currentVersion: '0.1.0-dev',
      fetchImpl: async () => new Response('', { status: 404 }),
    })).rejects.toThrow('버전 정책을 확인하지 못했습니다');
    await expect(fetchWebVersionStatus({
      apiBaseUrl: 'http://localhost:8080',
      currentVersion: '0.1.0-dev',
      fetchImpl: async () => { throw new Error('gateway down'); },
    })).rejects.toThrow('버전 정책을 확인하지 못했습니다');
  });

  test('개발 sentinel과 작성 중 견적 입력을 기존 계약대로 판정한다', () => {
    expect(resolveBuildAppVersion('0.1.0-dev')).toBe('0.1.0-dev');
    expect(hasUnsavedFormInput([
      { tagName: 'TEXTAREA', type: 'textarea', value: '현장 메모', defaultValue: '' },
    ])).toBe(true);
  });
});
