# #1092 S1 — source 구분 구현 보고서

- 작성일: 2026-08-12
- 담당: CODEX LUNA
- 범위: 견적서 통합 목록의 저장 출처 표시·필터
- 제외: `estimates` 단일화, 웹앱 저장 배선, 웹 왕복/복원, 미리보기, 전환 계보

## 정찰 사실

정찰 보고서(`2026-08-12-1092-recon-sol.md`)와 Issue #1092 전체 코멘트 확인 결과, 변경 전 목록은 `estimates + partner_orders`만 병합했다. `quote_snapshots` 4건과 `partner_order_drafts` 11건은 기존 목록 API/모델이 읽지 않아 목록에 없었다.

실측 원문:

```text
slip_db.estimates: 전체 2,063 / 활성 45 / soft-delete 2,018
partner_order_db.partner_orders: 전체 2,025 / 활성 4
slip_db.quote_snapshots: 전체 4 / 활성 4 / soft-delete 0
partner_order_db.partner_order_drafts: 전체 2,005 / 활성 11 / soft-delete 1,994
```

## 구현

- 데스크톱 통합 모델에 `estimate`, `order`, `web-quote-snapshot`, `web-partner-order-draft` source를 추가했다.
- 각 행에 저장 위치(`데스크톱`/`웹`)와 저장 계열(`종합견적서`/`주문서`)을 함께 표시한다.
- source filter를 추가했다. 후보 표시명은 `데스크톱 · 종합견적서`, `데스크톱 · 주문서`, `웹 · 종합견적서`, `웹 · 주문서`이며, 개발책임자 확정 전 상수로 분리했다.
- slip-service와 partner-order-service에 UUID·payload 없는 읽기 전용 desktop-list API를 추가했다.
- 기존 snapshot 복원 API와 partner draft self-scope API는 변경하지 않았다.
- 웹 draft 목록 API는 UUID가 아닌 `partnerCode:draftSeq`를 내부 비노출 행 키로 사용하며, 응답 DTO에는 UUID가 없다.

## 건수 보존

변경 전 실제 활성 목록:

```text
estimates 45 + partner_orders 4 = 49건
웹 저장분은 0건
```

변경 후 예상 실제 목록:

```text
estimates 45 + partner_orders 4 + quote_snapshots 4 + partner_order_drafts 11
= 64건
웹 저장분 4 + 11 = 15건
```

기존 49건은 모델의 append/merge 경로에 그대로 남기고, 웹 15건을 추가한다. source filter는 병합 후 행을 제거하지 않고 선택 source만 보여 준다.

## RED → GREEN 원문

RED-first로 모델 테스트에 불변식 1~4를 먼저 추가했다.

```text
$ npx vitest run src/renderer/routes/estimateUnifiedListModel.test.ts
FAIL (7 tests | 3 failed)
× 모든 행에 저장 출처를 표시한다 — expected length 4, got 2
× 출처로만 통합 목록 행을 필터링한다 — filterUnifiedEstimateRowsBySource is not a function
× 실측 웹 저장분 4건과 11건을 하나도 누락하지 않는다 — expected 15, got 0
```

불변식 4의 기존 행 미유실 테스트는 별도로 추가했으며, 45 estimates + 7 partner_orders = 52건을 요구한다.

구현 후:

```text
$ npx vitest run src/renderer/routes/estimateUnifiedListModel.test.ts src/renderer/routes/EstimateListPage.test.tsx
Test Files  2 passed (2)
Tests       17 passed (17)
```

추가 검증:

```text
$ ./gradlew.bat :services:slip-service:compileJava :services:partner-order-service:compileJava --no-daemon
BUILD SUCCESSFUL

$ npm run typecheck  # clients/desktop
exit 0
```

관련 두 서비스 전체 `test` 실행은 120초 제한에 걸려 종료됐다. Java compile은 성공했으며, 전체 서비스 테스트 성공으로 주장하지 않는다.

## 출처 명칭 후보 / 미확정

현재 코드 후보는 다음과 같다.

```text
(a) 데스크톱 · 종합견적서 / 데스크톱 · 주문서 / 웹 · 종합견적서 / 웹 · 주문서
(b) 데스크톱 저장 / 웹 종합견적서 / 웹 주문서
(c) 정규 견적 / 확정 주문 / 종합견적서 웹 / 주문서 웹
```

이번 구현은 (a)를 필터 표시 후보로 사용했지만, 최종 용어는 개발책임자 확정 대상으로 남겼다. `UNIFIED_ESTIMATE_SOURCE_LABELS`와 `UNIFIED_ESTIMATE_SOURCE_FILTER_LABELS`만 바꾸면 변경 가능하다.

## UUID·범위 점검

- 화면 row에는 UUID 컬럼이 없다.
- 새 웹 목록 API 응답 DTO에도 UUID 필드와 payload가 없다.
- 이번 변경에는 DB migration이 없다. 따라서 이 브랜치·`main`·머지 안 된 다른 브랜치의 migration 번호를 셀 대상이 없다.
- 공유 DB에는 쓰지 않았다. 정찰 원문의 read-only 실측 수치만 사용했다.
- 못 한 것: `estimates` 단일화, 신규 웹 저장 cutover, 웹 왕복/복원, 미리보기, source별 담당 검증, live QA.

## 라운드 종료 점검

```text
git ls-files --deleted: 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs: 존재
```

이번 라운드에서 생성한 테스트용 Testcontainers/Gradle 프로세스는 종료되었고, 별도 격리 컨테이너·임시 디렉터리는 남기지 않았다.
