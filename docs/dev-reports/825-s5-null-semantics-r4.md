# #825 슬5 null-semantics R4 수정 기록

## 범위

PR #864 R4에서 A~F 적대검증 결함을 전 심각도 대상으로 재검증했다. 저장 범위와 실행 범위 모두 `scopeMode`를 의미의 권위값으로 사용하도록 정리했다.

## 계약 변경

- CODEF 실행 POST는 `scopeMode`를 필수로 받는다.
- `scopeMode=ALL`은 ref 배열을 생략하고 요청 `type`의 CODEF 목록을 열거한다.
- `scopeMode=SELECTED`는 세 ref 배열을 모두 명시하고 하나 이상 선택해야 한다.
- mock handler도 동일한 상태코드와 의미를 적용한다.

## DB 불변식

V64는 이미 적용된 Flyway migration이므로 주석과 checksum을 수정하지 않았다. V65에 `scope_mode`와 세 JSON ref 배열의 조합 CHECK를 추가해 애플리케이션 우회 INSERT/UPDATE도 `ALL+refs` 및 `SELECTED+empty refs`를 거부한다.

## 검증

- accounting + inventory genuine Gradle: `26 actionable tasks: 26 executed`
- desktop typecheck: `npm run typecheck` 통과
- desktop mock Playwright: 36 tests / 83 files real-QA config inventory, JSON reporter `expected=36, skipped=0, unexpected=0`

## HIGH-1 도달성 결함 fix (2026-07-22)

### 원인과 계약 판단

`CodefImportScopedService`가 `scopeMode=ALL`의 열거 범위를 요청 `type`만으로 결정해,
저장 `defaultImportType=CARD`인 사용자가 요청 `type=ALL`을 보내면 계좌·카드·대출 전체로
확대될 수 있었다. D-S5-06-R2의 저장 기반 실행 계약에 따라 BE가 사용자 scope를 조회하고,
저장 scope도 `ALL`인 경우 저장 `defaultImportType`을 권위값으로 강제한다. 저장 scope가 없는
명시적 ALL 실행은 기존 요청 type 계약을 유지한다. 저장 `SELECTED` 실행은 요청의 세 ref 배열과
type을 그대로 사용해 저장 선택 실행 경로를 깨뜨리지 않는다.

### 변경

- BE: `CodefImportScopedService`가 `UserCodefImportScopeService.get()`으로 scope를 읽고
  저장 `ALL`의 `defaultImportType`을 요청 type보다 우선한다.
- FE: `CodefImportScopeForm` 유형 드롭다운에 `disabled={!canUpdate}`를 적용했다. CREATE만
  있는 사용자는 저장 범위를 바꾸지 못하지만, 저장 scope가 유효하면 가져오기는 계속 가능하다.
  저장된 ALL의 유형을 바꾼 뒤 저장하지 않은 상태는 가져오기를 잠가 BE 권위값과 화면 표시가
  어긋나지 않게 한다. 저장된 SELECTED의 explicit refs 실행은 잠그지 않는다.
- mock: 저장 `ALL` scope의 default type을 BE와 동일하게 적용했다.

### 뮤테이션 RED 원문

- BE 격리 사본에서 저장 type 강제 조건을 제거: XML `tests=7, failures=4, skipped=0,
  errors=0` — 저장 BANK/CARD/LOAN 및 저장 CARD·요청 ALL 회귀가 RED.
- FE 격리 사본에서 `disabled={!canUpdate}` 제거: `19 tests | 1 failed`,
  `canUpdate=false ... expected false to be true`.
- mock의 저장 CARD·요청 ALL 테스트를 먼저 추가한 RED: `122 tests | 1 failed`,
  `expected 16 to be 6`; 저장 scope를 읽도록 수정 후 `122 passed`.

### genuine 검증

- 회계 서비스 전체 Gradle: `.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache`,
  `BUILD SUCCESSFUL`, `21 actionable tasks: 21 executed`. Gradle XML 189개 합계:
  `tests=1466, failures=0, skipped=10, errors=0`.
- `CodefImportScopedServiceTest` XML: `tests=7, failures=0, skipped=0, errors=0`.
- desktop: `npm run typecheck` 통과; `CodefImportScopeForm.test.tsx` `20 passed`;
  `mock.test.ts` `122 passed`.
- Playwright 전체 스위트는 실행하지 않았다(스크린샷 덮어쓰기 방지). 전용 단일 스펙도 이번
  수정에서는 실행하지 않았으므로 새 실캡처 증거는 추가하지 않았다.
