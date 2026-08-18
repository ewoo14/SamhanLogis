# PR #1248 CODEX LUNA fix 라운드 2 보고서

## ① RED 원문 — 서버 도착 순서 역전 재현

먼저 저장 서비스 테스트에 실제 서버 도착 순서를 `B → A`로 고정했다. 현재 서비스에는 요청 sequence 계약이 없어 다음 원문으로 실패했다.

```text
SalesCommissionSettlementCalculationServiceTest.java:72:
error: method calculate in class SalesCommissionSettlementService cannot be applied to given types;
  required: UUID,int,SalesCommissionSettlementCalculationInput
  found:    UUID,int,SalesCommissionSettlementCalculationInput,long
BUILD FAILED
```

RED 테스트의 의도는 다음과 같다.

```text
서버 도착 B: total=828282, requestSequence=2
서버 도착 A: total=717171, requestSequence=1
기대 저장소: total=828282, A의 늦은 저장은 무시
정상 경로: A(1) → B(2) 도착 시 저장소 total=828282
```

화면 상태만 검사하지 않고 `repository.save` 호출 횟수와 aggregate의 저장 snapshot까지 단정했다.

## ② 고른 수단과 이유

클라이언트가 자동 저장 요청마다 단조 증가하는 `requestSequence`를 보내고, 서버가 정산 행을 `PESSIMISTIC_WRITE`로 잠근 뒤 이미 저장된 sequence 이하의 요청을 무시하도록 했다. sequence를 DB에 보존하므로 화면 응답 순서뿐 아니라 서버 도착 순서가 뒤집혀도 저장소의 최신 값이 보호된다. 새로고침 뒤에도 `Date.now()` 기반 sequence로 이전 저장보다 큰 값을 시작한다.

검토 후 취소한 수단: 요청 취소만으로는 이미 서버에 도착한 A 저장을 되돌릴 수 없고, 클라이언트 응답 sequence만으로는 이번 결함의 저장소 분모를 닫지 못하므로 채택하지 않았다.

변경 경계:

- `SalesCommissionSettlement`에 `last_calculation_request_sequence`와 Flyway `V101` 추가
- 저장 시 행 잠금을 사용하는 계산 service/repository 경계 추가
- 계산 요청 DTO와 desktop API에 `requestSequence` 추가
- 화면의 기존 응답 sequence 필터는 유지하고, 요청 sequence를 함께 전송

## ③ GREEN

실행 명령:

```text
.\gradlew.bat :services:accounting-service:test \
  --tests 'com.samhanair.logis.accounting.service.SalesCommissionSettlementCalculationServiceTest' \
  --tests 'com.samhanair.logis.accounting.web.SalesCommissionSettlementControllerTest' \
  --tests 'com.samhanair.logis.accounting.web.dto.CalculateSalesCommissionSettlementRequestTest' \
  --tests 'com.samhanair.logis.accounting.domain.SalesCommissionSettlementTest' \
  --tests 'com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationSnapshotTest' --no-daemon
BUILD SUCCESSFUL
```

핵심 결과:

```text
late_arriving_older_request_cannot_overwrite_newer_request_in_persistence PASS
normally_arriving_newer_request_is_persisted PASS
10 tests completed, 0 failed
```

desktop 화면 회귀:

```text
npx vitest run src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx --config vitest.config.ts
Test Files 1 passed
Tests 10 passed
```

desktop 검증:

```text
npm run typecheck  PASS
npm run lint       exit 0 — 0 errors / 196 warnings
npm run build      PASS
```

## ④ 라이브 캡처

현재 워크트리 HEAD로 빌드한 격리 gateway/accounting/Vite 스택이 기동돼 있지 않아, 기존 `clients/desktop` 실 QA 스펙을 Chromium `headless: true`로 실행했다. Chromium은 정상 기동했으나 인증 후 격리 앱이 로그인 화면에 남아 캡처 단계에 도달하지 못했다.

실패 원문:

```text
Error: expect(page).not.toHaveURL(expected) failed
Expected pattern: not /\/login/
Received string: "http://127.0.0.1:5943/#/login"
```

따라서 이번 라운드의 새 라이브 캡처는 **0장**이다. 저장 후 새로고침 캡처 및 행 수는 라이브 스택 미기동으로 확정하지 않는다. 기존 캡처를 현재 HEAD의 증거로 재사용하지 않았다.

## ⑤ 직전 세 가지 유지 근거

- 입력 중 응답이 폼을 덮지 않는 기존 화면 테스트 10건이 통과했다.
- 마지막 입력의 계산 결과를 화면에 남기는 기존 response sequence 필터를 변경하지 않았고, 위 테스트가 통과했다.
- `amountLabel` 문자열 표시 로직을 변경하지 않았으며, typecheck/build와 화면 테스트가 통과했다. `.000000` 제거 동작도 유지된다.

## ⑥ 프로세스 회수

이번 라운드에서 기동한 서비스·컨테이너는 없다. Playwright Chromium과 Gradle 테스트 프로세스는 종료됐다. 점검 시 `127.0.0.1:5943`에는 기존 PID 100024의 Vite가 남아 있었으며, 이번 라운드가 기동한 프로세스가 아니므로 다른 세션 보호를 위해 종료하지 않았다.

```text
이번 라운드 기동 컨테이너 잔여: 0
이번 라운드 기동 포트 잔여: 0 (기존 Vite 5943 1개는 보존)
이번 라운드 Chromium 잔여: 0
이번 라운드 Java/Gradle 잔여: 0
이번 라운드 JAR/바이너리 산출물 잔여: 0
공유 스택 및 다른 워크트리: 미접촉
git add / commit / push: 미실행
```
