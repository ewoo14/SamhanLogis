# 사내 메신저 배너 통일 + 인증서 만료 알림

## 설계와 근거

- 세 앱의 표시 계층은 기존 `AppUpdateNotice`를 사용한다. design-system 컴포넌트는 수정하지 않았다.
- internal-chat의 updater 상태는 React `InternalChatUpdateGate`로 옮겼다. 감지·다운로드·설치·재기동 IPC는 기존 경로를 유지하고, 표시만 공통 계층으로 바꿨다.
- updater 문구는 기존 desktop/arologis `AppVersionGate`의 제목·본문을 그대로 사용했다. 문구 개선은 #1214 범위로 남겼다.
- 인증서 정본은 `docs/operations/certificates/samhan-internal-release.json`에 둔다. thumbprint와 `notBefore`/`notAfter`는 비밀이 아니며 리뷰·감사 가능한 운영 기록이어야 한다.
- 현재 정본은 `pending-issuance` placeholder다. 따라서 빈 날짜는 조용한 `unknown`이다. `issued`인데 날짜가 비어 있거나 무효이면 `unknown`과 운영 이상을 분리해 console warning 및 비차단 화면 알림을 낸다. 발급 후 registry 손실을 조용히 fail-open으로 흘리지 않기 위한 구분이다.
- 만료 판정은 `Math.ceil` 일수로 31일은 없음, 30일 이하는 임박, 0일 이하는 만료다. 만료 전 자동 설치는 계속 허용한다.
- 외부 알림 채널과 수신자는 정찰 미결 6이므로 이번 변경은 앱 화면과 운영 로그까지만 한다.

## 변경 파일

- `scripts/certificate-expiry.cjs`, `scripts/certificate-expiry.test.cjs`
- `scripts/certificate-registry.cjs`
- `docs/operations/certificates/samhan-internal-release.json`
- 세 Electron 앱의 `CertificateExpiryNotice` 및 앱 root 연결
- `clients/internal-chat-desktop/src/renderer/InternalChatUpdateGate.tsx`
- `clients/internal-chat-desktop/src/renderer/main.ts`
- `clients/internal-chat-desktop/src/renderer/InternalChatUpdateGate.test.tsx`

## RED → GREEN 원문 요약

RED-first에서 확인한 초기 실패:

```text
cd clients/desktop
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
Error [ERR_MODULE_NOT_FOUND]: Could not resolve 'vitest/config'
```

root 의존성 부재로 guard가 시작되지 않았다. 새 하네스는 추가하지 않았다.

구현 전 banner 테스트도 기대 상태가 없어서 실패했고, 구현 후 다음이 통과했다.

```text
npx vitest run src/renderer/InternalChatUpdateGate.test.tsx src/main/auto-update.test.ts
Test Files 2 passed (2)
Tests 9 passed (9)

node --test scripts/certificate-expiry.test.cjs
tests 4
pass 4
fail 0
```

## 검증

- desktop targeted updater/version tests: 33/33 PASS
- arologis targeted updater/version tests: PASS
- internal-chat targeted updater tests: 9/9 PASS
- design-system 전체: 32 files, 283 tests PASS
- desktop/arologis typecheck 및 build: PASS
- internal-chat typecheck 및 build: PASS
- arorologis fresh shell 9101→9102: 설치·재기동·다운그레이드 PASS
- internal-chat fresh shell: 기존 runner가 기대하는 installer 파일명과 실제 산출물명이 달라 installer lookup에서 실패. updater 실패로 세지 않고 runner 계약 불일치 관측 불가로 남긴다.

## 관측 불가 / 미결

- 삼한 desktop 전용 fresh 9101→9102 runner는 정찰상 없다.
- 세 앱의 실제 Electron 배너 캡처는 기존 하네스가 updater 상태를 주입·캡처하는 경로를 제공하지 않아 이번 실행에서 만들지 않았다. 가짜 캡처는 남기지 않았다. 따라서 세 앱 배너 동일성의 시각 증거는 관측 불가다.
- internal-chat 전체 회귀는 기존 messenger UI 시간 fixture 2건이 `오전 8:36` 대신 상대 날짜를 렌더링해 실패했다. 이번 배너 변경과 무관하며 통과로 세지 않는다.
- 외부 인증서 만료 알림 채널과 실제 발급 후 registry 공급 자동화는 미결 6이다.

## 불변식 근거

1. 같은 `AppUpdateNotice`와 기존 updater 문구 계층을 사용한다.
2. notice는 기존 non-fixed 카드이며 children/login/chat을 덮지 않는다.
3. 내부 오류 코드·경로·UUID는 renderer 문구에 전달하지 않는다.
4. 기존 updater IPC와 auto-update 테스트를 보존했고 targeted 회귀가 통과했다.
5. `issued` 이후 registry 오류는 visible unknown + 운영 로그로 드러낸다.
