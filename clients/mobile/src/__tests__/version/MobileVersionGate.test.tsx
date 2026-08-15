import React from 'react';
import { Text } from 'react-native';
// @ts-expect-error react-test-renderer 19 has no bundled declaration in this app.
import { act, create } from 'react-test-renderer';
import { MobileVersionGate } from '../../version/MobileVersionGate';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../version/otaUpdates', () => ({
  checkForOtaUpdate: jest.fn().mockResolvedValue('deferred'),
  subscribeToOtaUpdates: jest.fn((listener: (snapshot: unknown) => void) => {
    listener({ phase: 'available', activity: true, result: 'deferred' });
    return jest.fn();
  }),
}));

jest.mock('../../version/versionCheck', () => ({
  fetchMobileVersionStatus: jest.fn().mockResolvedValue({
    forceLevel: 'NONE',
    latestVersion: '2026/08/15-9102',
    releaseNotes: '',
  }),
  getMajorSessionDismissKey: jest.fn(),
  getMinorDismissStorageKey: jest.fn(),
  isBlockingForceLevel: jest.fn().mockReturnValue(false),
  VERSION_POLICY_FAILURE_MESSAGE: 'version policy failed',
}));

describe('MobileVersionGate OTA 사용자 표시', () => {
  it('작업 중 준비된 OTA를 자동 적용 대기 상태로 표시한다', async () => {
    let screen: ReturnType<typeof create>;
    await act(async () => {
      screen = create(
        <MobileVersionGate>
          <Text>주문 화면</Text>
        </MobileVersionGate>,
      );
    });

    const text = screen!.root.findAllByType(Text).map((node: { props: { children?: unknown } }) => node.props.children).flat().join(' ');
    expect(text).toContain('새 업데이트를 준비했습니다');
    expect(text).toContain('입력 중인 작업을 보호하기 위해 작업이 끝난 뒤 자동으로 적용합니다.');
  });
});
