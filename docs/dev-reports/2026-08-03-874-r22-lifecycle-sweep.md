# R22 lifecycle 전이 매핑 전수 sweep

- 작업일: 2026-08-03
- 대상: PR #1057 / R22
- 범위: 전표 lifecycle 화면 버튼 엔드포인트와 백엔드 요구 전이의 전수 대조 및 불일치 수정
- 제한: commit/push 금지, Docker 작업 금지, `clients/desktop/playwright/874-riusage-real-qa.spec.ts` 수정 금지

## 작업 로그

### 시작

- `git pull`: `Already up to date.`
- RED-first 원칙에 따라 불일치별 계약 테스트를 먼저 추가하고 실패 원문을 기록한다.

### RED — INSPECTING 전이 계약

실행:

```text
npm exec vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts
```

원문 요약:

```text
FAIL  src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts
Tests  1 failed | 2 passed (3)
INSPECTING action calls the backend inspect transition to enter COMPLETED
AssertionError: expected source to match /case 'INSPECTING':\s*return \['inspect'\]/
```

## 전수 대조표

근거: 프런트 `SlipDetailPage.tsx:289-305,317`, BE `SlipController.java:459-567`, 도메인 `SlipDomainTest.java:384-439`, 서비스 `SlipServiceTest.java:307-315,654-664`.

| 상태 | 화면 버튼 라벨 | 프런트 호출 | BE 요구 엔드포인트/전이 | 일치 |
|---|---|---|---|---|
| DRAFT | 저장 / 취소 | `/save` / `/cancel` | `/save`: DRAFT→SAVED / `/cancel`: DRAFT→CANCELED | ✅ |
| SAVED | 전송 / 취소 | `/send` / `/cancel` | `/send`: SAVED→SENT / `/cancel`: SAVED→CANCELED | ✅ |
| SENT | 수락 / 반려 / 취소 | `/accept` / `/reject` / `/cancel` | `/accept`: SENT→ACCEPTED / `/reject`: SENT→REJECTED / `/cancel`: SENT→CANCELED | ✅ |
| ACCEPTED | 처리 시작 / 반려 | `/process` / `/reject` | `/process`: ACCEPTED→PROCESSING / `/reject`: ACCEPTED→REJECTED | ✅ |
| PROCESSING | 검수 시작 | `/complete` | `/complete`: PROCESSING→INSPECTING | ✅ |
| INSPECTING | 처리 완료 | `/inspect` | `/inspect`: INSPECTING→COMPLETED | ✅ (R22 수정) |
| COMPLETED (OUTBOUND) | 배송 시작 | `/ship` | `/ship`: COMPLETED→SHIPPING | ✅ |
| COMPLETED (INBOUND) | 확정 | `/confirm` | `/confirm`: COMPLETED→CONFIRMED | ✅ |
| SHIPPING (OUTBOUND) | 배송 완료 | `/deliver` | `/deliver`: SHIPPING→DELIVERED | ✅ |
| SHIPPING (INBOUND) | 없음 | 없음 | 해당 분기 없음 | ✅ |
| DELIVERED (OUTBOUND) | 확정 | `/confirm` | `/confirm`: DELIVERED→CONFIRMED | ✅ |
| DELIVERED (INBOUND) | 없음 | 없음 | 해당 분기 없음 | ✅ |
| CONFIRMED (OUTBOUND/INBOUND) | 없음 | 없음 | 최종 상태, 전이 없음 | ✅ |

## 어긋난 항목

- R22 이전 `INSPECTING` 행: `완료 (처리 완료)` 버튼이 `/complete`를 호출했으나 BE `/complete`는 PROCESSING→INSPECTING만 허용했다.
- R22 수정: `INSPECTING` 액션을 `/inspect`로 변경하고 `inspect` 액션 라벨을 `처리 완료`로 고정했다.
- `PROCESSING`의 `/complete`와 `검수 시작` 라벨, INBOUND `inbound.inspection` 가드는 유지했다.

## GREEN 원문

프런트 계약 테스트:

```text
✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (3 tests)
Test Files 1 passed (1)
Tests 3 passed (3)
```

BE 근거 회귀 테스트:

```text
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.domain.SlipDomainTest --tests com.samhanair.logis.slip.service.SlipServiceTest
BUILD SUCCESSFUL in 12s
```

## 표 전체 일치 재확인

- `actionsForStatus`의 DRAFT~DELIVERED 모든 분기와 `ACTION_LABEL`을 재검토했다.
- OUTBOUND/INBOUND 분기(COMPLETED, SHIPPING, DELIVERED)를 별도 행으로 확인했다.
- `accept`, `process`, `complete`, `inspect`, `ship`, `deliver`, `confirm` BE 매핑은 변경하지 않았다.
- 계약 테스트 3/3 및 SlipDomainTest/SlipServiceTest green을 fresh 실행으로 확인했다.
- stale `INSPECTING → complete` source mapping 부재와 현재 `return ['inspect']` mapping을 별도 PowerShell 검사로 확인했다.
- `git diff --check`: 출력 없음.

## 백엔드 명명 관찰 (별건)

- BE 엔드포인트 이름과 업무 의미가 교차되어 있다: `/complete`는 PROCESSING→INSPECTING(검수 시작), `/inspect`는 INSPECTING→COMPLETED(검수 완료/처리 완료)다.
- 기존 데이터·도메인 테스트와의 계약을 보존하기 위해 R22에서는 명명을 변경하지 않고 프런트 호출만 정렬했다.

## 새 파일 목록

- `docs/dev-reports/2026-08-03-874-r22-lifecycle-sweep.md`

수정 파일(기존 파일):

- `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`
