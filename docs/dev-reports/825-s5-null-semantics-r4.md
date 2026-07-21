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
