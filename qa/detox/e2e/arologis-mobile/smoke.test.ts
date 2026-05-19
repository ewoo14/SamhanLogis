/**
 * 아로로지스 기사 어플 — Smoke E2E (Detox Android)
 *
 * 시나리오:
 *   1) App 부팅 → 로그인 화면 표시 확인
 *   2) PhoneLoginScreen heading "아로로지스 기사" 텍스트 가시성 확인
 *   3) Pretendard 폰트 로드 완료 후 수동 입력 카드(phone-input / phone-submit) 노출 확인
 *   4) 빈 번호 제출 → Alert 방어 동작 확인
 *
 * NOTE: backend 미가동 시 로그인 API 호출은 실패하므로
 *       happy-path 로그인 성공 시나리오는 별도 backend-connected 환경에서만 활성.
 *       본 스모크는 UI 렌더링 + 폰트 로드까지만 검증한다.
 *
 * testID 매핑 (PhoneLoginScreen.tsx):
 *   - "phone-input"         수동 입력 TextInput
 *   - "phone-submit"        수동 로그인 버튼
 *   - "phone-auto-submit"   자동 인식 1-tap 버튼 (READ_PHONE_NUMBERS 권한 필요)
 *   - "auto-phone-display"  자동 인식 번호 표시 Text
 *   - "use-different-number" 다른 번호로 로그인 링크
 */
describe('아로로지스 기사 어플 — 스모크', () => {
  beforeAll(async () => {
    // 에뮬레이터에 새 인스턴스로 앱 부팅.
    // 권한 다이얼로그는 자동 거부(grant)하지 않아 READ_PHONE_NUMBERS 권한 미부여
    // → 자동 인식 카드 미표시 → 수동 입력 카드 노출 경로로 진행.
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES' },
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('앱 부팅 후 로그인 화면이 표시된다', async () => {
    // PhoneLoginScreen 의 heading — "아로로지스 기사" 텍스트 노출 대기.
    // Pretendard 폰트 로드 완료 후 heading 이 렌더링되므로 폰트 로드도 동시에 검증.
    await waitFor(element(by.text('아로로지스 기사')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('수동 입력 카드(phone-input, phone-submit)가 표시된다', async () => {
    // READ_PHONE_NUMBERS 권한 미부여 → 자동 인식 불가 → 수동 카드 fallback.
    // usePretendardFontGuarded graceful guard 완료 후 수동 카드 렌더링.
    await waitFor(element(by.id('phone-input')))
      .toBeVisible()
      .withTimeout(15000);

    await waitFor(element(by.id('phone-submit')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('빈 번호 제출 시 Alert 방어 동작을 확인한다', async () => {
    // phone-submit 버튼 탭 (phone-input 비워둔 상태).
    await element(by.id('phone-submit')).tap();

    // Alert "휴대번호를 입력해 주세요." 노출 확인.
    await waitFor(element(by.text('휴대번호를 입력해 주세요.')))
      .toBeVisible()
      .withTimeout(5000);

    // Alert 닫기 (OK 버튼 또는 시스템 기본 닫기).
    await element(by.text('확인')).tap().catch(async () => {
      // 일부 Android 에뮬레이터에서 Alert 버튼 레이블이 'OK' 로 표시될 수 있음.
      await element(by.text('OK')).tap();
    });
  });
});
