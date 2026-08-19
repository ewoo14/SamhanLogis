# PR #1271 fix 라운드 2 결과

## ① 저장 성공 후 저장내역에 안 보이던 원인

저장은 지연된 것이 아니었다. 백엔드 `POST /warehouse/audit/dps-history` 성공 뒤 화면은 `setActiveTab(1)`만 호출했고, 저장내역 탭의 React Query key인 `['dps-history-list', programType, query]`를 invalidate/refetch하지 않았다. 따라서 목록은 이전 캐시를 계속 표시했다.

수정은 `DPS_COMPARE` prefix query를 무효화하는 `refreshDpsHistoryQueries()`를 추가하고, 자동 저장 성공 후와 명시 저장 성공 후 모두 호출하도록 연결했다. 조회 조건은 기본 목록의 `programType=DPS_COMPARE`, `mode=MANUAL_NAMED`, 오늘을 포함하는 날짜 범위와 저장 행이 일치한다.

## ② 저장 전/후 목록 행 수

적대검증 기존 라이브 캡처에서 명시 저장 직전 목록은 2행, 저장 성공 직후 갱신되지 않은 목록도 2행이었다. 캡처: `docs/qa/1271-sol-reverdict-2/screenshots/09-manual-save-immediate-history-real-qa.png`.

이번 라운드의 새 라이브 저장 전/후 수치는 백엔드 포트가 닫혀 있어 측정하지 못했다. 실제 스펙 실행 결과는 다음과 같다.

```text
Playwright Chromium 기동: 성공
첫 실제 요청: GET http://127.0.0.1:28086/internal/slips/inbound-lines
결과: ECONNREFUSED
저장 전 행 수: 측정 불가
저장 후 행 수: 측정 불가
```

## ③ 저장 → 목록 → 상세 복원 왕복

코드 왕복 경로는 유지된다. 목록 행 클릭 → `GET /warehouse/audit/dps-history/{id}` → `onRestore` → 실행 탭 복원이다. 명시 저장 성공 후에는 목록 query를 무효화한 뒤 저장내역 탭으로 이동한다.

이번 라운드에는 격리 백엔드가 없어 실제 왕복을 재실행하지 못했다. 기존 명시 저장 상세 복원 캡처는 `docs/qa/1271-sol-reverdict-2/screenshots/10-manual-history-restored-real-qa.png`이며, 기존 검증 수치는 77/77/77/0이다.

## ④ CI 2건 귀속과 처리

1. Frontend Desktop / 하네스 거짓 green 가드: PR 산출물 `docs/qa/1271-label-parity/renderer-5942.err`가 `.err` 확장자 census를 깨뜨렸다. 실패 원문은 `expected [ '.err' ] to deeply equal []`. 해당 PR 산출물을 삭제했다. testIgnore/skip은 추가하지 않았다.
2. 빌드 + 테스트 (shared+auth+gateway): `AccountingPermissionProjectionFreshnessIT` 실패 원문은 `MANAGER|inventory.dps db=1100010 projection=1000010`. V109 정본에 맞춰 체크인 projection을 `1100010`으로 수정했다. 로컬 `:services:auth-service:test --tests com.samhanair.logis.auth.it.AccountingPermissionProjectionFreshnessIT`는 `BUILD SUCCESSFUL`이었다.

## ⑤ RED 원문

수정 전 RED 테스트 원문:

```text
Error: Failed to load url ./dpsHistoryRefresh ...
Does the file exist?
```

이는 저장 성공 후 목록 query 무효화 동작을 제공하는 모듈이 없어서 발생한 의도된 RED다. 수정 후 `dpsHistoryRefresh.test.ts`는 1 test passed다.

## ⑥ 잃으면 안 되는 것 재현

기존 적대검증 수치를 보존했다.

```text
입고전표 라인 77 · DPS 행 77 · 실제 GET /internal/slips/inbound-lines 77
A 정상: 77/77/77/0
C 수량 동일·금액 다름: 77/77/76/1
D 수량 불일치: 77/77/76/1
B 불일치 0: 77/77/77/0
E 레거시 모델 정규화: 77/77/77/0
F 중복 키 정확행 우선: 77/78/77/1
집계 카드: 입고전표 라인 (출고 잔재 0)
MANAGER CREATE V109: 정본 projection 1100010, 로컬 freshness IT 통과
```

## ⑦ 스크린샷

PNG는 직접 열어 확인했다.

- 저장 직후 stale 목록 2행: `docs/qa/1271-sol-reverdict-2/screenshots/09-manual-save-immediate-history-real-qa.png`
- 명시 저장 상세 복원: `docs/qa/1271-sol-reverdict-2/screenshots/10-manual-history-restored-real-qa.png`
- 이번 라운드 새 PNG: 라이브 백엔드 미기동으로 생성하지 못함

## ⑧ git status --porcelain 원문

```text
 M clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx
 M clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts
 D docs/qa/1271-label-parity/renderer-5942.err
?? clients/desktop/src/renderer/utils/dpsHistoryRefresh.test.ts
?? clients/desktop/src/renderer/utils/dpsHistoryRefresh.ts
?? docs/qa/1271-fix-round2/
?? docs/qa/1271-sol-reverdict-2/
```

## ⑨ 프로세스 회수

이번 라운드에서 백엔드·renderer 프로세스와 격리 컨테이너는 기동하지 않았다. Playwright Chromium은 테스트 종료와 함께 종료됐다. 최종 확인은 `samhan-*` 컨테이너 24개, 전체 컨테이너 26개였고 공유 컨테이너는 변경하지 않았다. 포트 `28085`, `28086`, `5942`는 모두 CLOSED다.

커밋·push·git add는 수행하지 않았다.
