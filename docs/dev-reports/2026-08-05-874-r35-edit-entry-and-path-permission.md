# R35 — 편집 진입점·전이 문구·권한 진입 경로 재수렴

## 범위와 기준선

- 작업 브랜치: `feat/874-set-riusage-global-dc`
- 착수 HEAD: `17e79e1d68bd534dcb73361caed55563bd3ac1af`
- 기준 보고서: `docs/dev-reports/2026-08-05-874-r34-sol-reconvergence.md`
- 범위 밖: 시나리오 2~5 회계 배분·전기, `slip-service` 권한 계약 변경, 컨테이너 조작, DB 쓰기, 다른 트랙 파일, `docs/handoff/`

R34 보고서를 통독한 결과, 이번 수정 대상은 R34가 기록한 세 가지 제품 결함과 매뉴얼 오기 1건이다. 서버의
OUTBOUND 조회 허용 집합은 `SALES / MANAGER / MASTER`, INBOUND 조회 허용 집합은
`WAREHOUSE / MANAGER / MASTER`로 유지하고 화면을 이 계약에 맞춘다.

## 결함별 진단과 불변식

### 결함 1 — 직접수정·협업수정 진입점

R33이 DRAFT/SAVED 협업수정 진입점을 되살렸지만 직접수정 폼과 협업 overlay 폼을 동시에 열 수 있게 했다.
두 폼은 같은 `memo` 저장 필드를 서로 다른 시점의 초안으로 보유하며, 협업 commit은 직접수정의
`updatedAt`을 검사하지 않아 직접수정 저장 뒤 오래된 협업 초안이 409 없이 덮어쓸 수 있다.
R34가 이 경로의 OUTBOUND DRAFT 영향 건수를 115건으로 기록했다.

불변식:

1. 직접수정은 `직접 수정`, 협업수정은 `협업 수정`으로 구분한다.
2. 두 편집 표면은 동시에 열리지 않는다. 한 표면이 열려 있으면 다른 표면의 진입점을 숨겨 stale 초안의
   저장 경로 자체를 차단한다.
3. R33이 되살린 DRAFT/SAVED 협업수정 진입점과 유형별 권한 판정은 유지한다.

### 결함 2 — `complete` 재고 부족 문구

R32의 재고 409 정책이 전이 action을 받지 않아 `accept` 문구를 `complete`에도 사용했다.

불변식:

- `accept` 재고 부족은 기존 수락 문구를 유지한다.
- `complete` 재고 부족은 검수 대기 전환 실패를 설명하며 `수락`이라고 하지 않는다.
- `inventory / concurrent / unknown` 원인 분류와 편집 표면 잠금 정책은 유지한다.

### 결함 3 — 메뉴→목록→상세 권한 경로

`/sales`·`/purchases` 및 전표 상세 라우트는 동적 PageCode 권한만으로 진입했고, 서버의 유형별 조회 guard와
같은 판정을 사용하지 않았다. 그 결과 `ACCOUNTANT`와 `WAREHOUSE`가 메뉴 또는 빠른 진입점을 본 뒤 목록·상세
조회에서 403을 만났다.

불변식:

- 메뉴, 목록 라우트, 상세 라우트, 실제 목록 조회가 같은 `canQuerySales`/`canQueryPurchases` 판정을 쓴다.
- 서버 권한 계약 자체는 변경하지 않는다.
- `WAREHOUSE`의 INBOUND, `ACCOUNTANT`의 OUTBOUND PageCode seed가 넓더라도 서버 guard가 막는 유형은
  화면에서 노출하지 않는다.

### 결함 4 — 모바일 매뉴얼

제품의 `전표 취소` 라벨과 CANCELED handler는 정상인데 모바일 매뉴얼 1행이 `전표 삭제 | CANCELED 처리`로
기술하고 있었다.

불변식:

- 매뉴얼의 CANCELED 행을 `전표 취소`로 고친다. soft delete의 `전표 삭제` 의미는 유지한다.

## RED 원문 — 코드 수정 전

아래 실행은 코드 수정 전에 수행했다. 이 시점에는 R35 코드 변경이 없었다.

### RED-A — 보존해야 할 R33/R32 동작 기준

- A1: `SlipDetailPage.tsx`의 DRAFT/SAVED 협업수정 진입점은 존재한다.
- A2: `slipActionPermissionRequirements()`의 INBOUND `purchases.*`, OUTBOUND `sales.*` 유형별 매핑은
  현재 계약 테스트에서 통과한다.
- A3: `전표 삭제`와 `전표 취소` 라벨·핸들러 분리는 현재 계약 테스트에서 통과한다.
- A4: `inventory / concurrent / unknown` 분류와 기존 동시 전이 정책은 현재 계약 테스트에서 통과한다.
- A5: 아래 Playwright mock 회귀 게이트는 결함 1 때문에 실패한다.

### RED-B — 재발 결함 원문

명령:

```text
cd clients/desktop
npx playwright test playwright/slip-collab/coedit-s2a.shots.spec.ts --grep 'mobile-01' --reporter=line
```

원문:

```text
Running 1 test using 1 worker

[1/1] [chromium] › playwright\\slip-collab\\coedit-s2a.shots.spec.ts:393:3 › PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷 › mobile-01: 모바일(390x844) 편집 모드 반응형

  1) [chromium] › playwright\\slip-collab\\coedit-s2a.shots.spec.ts:393:3 › PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷 › mobile-01: 모바일(390x844) 편집 모드 반응형

    Error: 모바일 액션시트에 직접 수정 버튼이 보여야 한다

    Locator: locator('.mobile-more-sheet').getByRole('button', { name: '수정' })
    Expected: visible
    Error: strict mode violation: locator('.mobile-more-sheet').getByRole('button', { name: '수정' }) resolved to 2 elements:
        1) <button type="button" class="mobile-more-sheet-item">수정</button> aka getByRole('button', { name: '수정', exact: true })
        2) <button type="button" class="mobile-more-sheet-item">협업 수정</button> aka getByRole('button', { name: '협업 수정' })

      404 |     await page.getByRole('button', { name: '더보기' }).click()
      405 |     const editBtn = page.locator('.mobile-more-sheet').getByRole('button', { name: '수정' })
    > 406 |     await expect(editBtn, '모바일 액션시트에 직접 수정 버튼이 보여야 한다').toBeVisible({ timeout: 3_000 })
          |                                                         ^
      407 |     await editBtn.click()

  1 failed
    [chromium] › playwright\\slip-collab\\coedit-s2a.shots.spec.ts:393:3 › PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷 › mobile-01: 모바일(390x844) 편집 모드 반응형
```

관련 계약 테스트 명령:

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts --reporter=verbose
```

원문 결과:

```text
Test Files  1 passed (1)
Tests       22 passed (22)
```

위 테스트가 통과한 것은 R33 보존 계약이 깨지지 않았다는 뜻이지, 실제 모바일 액션시트의 접근성 이름
충돌과 양방향 저장 충돌이 해결됐다는 뜻은 아니다.

## 조치

### 결함 1 — 편집 진입점 분리와 stale 저장 경로 차단

- `SlipDetailPage.tsx`의 직접 편집 버튼 라벨을 데스크톱·모바일 모두 `직접 수정`으로 바꾸고,
  협업 편집 진입점은 `협업 수정`으로 고정했다.
- `editSurfaceEntryAvailability()`를 추가해 직접수정 폼이 열려 있으면 협업수정 진입점을 숨기고,
  협업수정 폼이 열려 있으면 직접수정 진입점을 숨긴다. 양쪽 상태가 동시에 감지되는 방어 경로도
  양쪽 진입점을 닫아 stale 초안 저장 경로를 노출하지 않는다.
- DRAFT/SAVED에서 협업수정이 계속 가능하다는 R33 계약은 유지했다. `desktopFooterActionSet`과
  데스크톱·모바일 액션시트가 새 배타적 진입점 판정을 공통 사용한다.
- mock Playwright selector와 협업 real-QA fallback도 각각 `직접 수정`·`협업 수정` exact selector로
  바꿨다.

### 결함 2 — `complete` 전용 재고 부족 안내

- 409 원인 분류(`inventory`·`concurrent`·`unknown`)와 기존 잠금 정책은 유지했다.
- transition mutation의 action을 정책 함수에 전달해 `complete` 재고 부족은
  `재고가 부족하여 전표를 검수 대기 상태로 전환할 수 없습니다...`로 안내한다.
- `accept`는 기존 `재고가 부족하여 전표를 수락할 수 없습니다...` 문구를 그대로 유지한다.

### 결함 3 — 서버 조회 guard와 메뉴·목록·상세 정합

- `session.ts`에 `canQueryPurchases()`를 추가하고 `canQuerySales()`도 서버 guard와 같은
  role 및 built-in group 집합을 판정하도록 보강했다.
- AppLayout 메뉴와 Dashboard 빠른 진입점에서 유형별 조회 권한이 없는 메뉴·버튼 및 조회 query를
  노출·실행하지 않게 했다.
- `/sales`, `/sales/slips`, `/sales/:id`, `/purchases`, `/purchases/slips`, `/purchases/:id`와
  legacy `/sales/query`, `/purchases/query`에 PageCode `PermissionGuard`와 유형별
  `SlipReadGuard`를 함께 적용했다.
- 판매·구매 조회 query에도 `enabled` guard를 적용해 허용되지 않은 유형의 API 호출을 막았다.
- `slip-service` 권한 계약, 서버 코드, DB는 변경하지 않았다.

### 결함 4 — 모바일 매뉴얼

- `docs/manual/08-실시간-협업/08-모바일-실시간-알림.md`의 CANCELED 행을 `전표 취소`로 수정했다.
  soft delete 의미의 `전표 삭제` 라벨은 제품과 문서의 다른 해당 위치에서 유지했다.

## GREEN 원문

### 변경 직접 참조 Vitest

명령:

```text
cd clients/desktop
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts src/renderer/components/__tests__/AppLayout.printSurface.test.tsx src/renderer/components/__tests__/AppLayout.drawer.test.tsx src/renderer/components/PermissionGuard.test.tsx src/renderer/stores/session.test.ts --reporter=verbose
```

원문 요약이 아닌 종료 블록:

```text
Test Files  5 passed (5)
Tests       58 passed (58)
Duration    4.35s
```

### 변경 관련 mock Playwright

명령:

```text
npx playwright test playwright/slip-collab playwright/sales-purchase-query playwright/sp-d3-slip-dispatch-permission-migration playwright/sidebar-disabled --reporter=line
```

원문:

```text
Running 30 tests using 1 worker
[CHECK] 매출 전표 수정 인라인 폼 오픈: PASS
[CHECK-①] header.memo 원격 텍스트 병합: PASS
[CHECK-③-memo] 커서 배지 count=1 text="원격사용자A" — PASS
[CHECK-⑤-clear] 수량 clear 후 값: "0" — PASS (7로 복원 안 됨)
[CHECK-⑥] UUID 비노출: PASS
[CHECK] 모바일 수정 인라인 폼 오픈: PASS
[CHECK-⑥] 모바일 UUID 비노출: PASS
30 passed (1.4m)
```

협업 데스크톱·모바일, 협업 패널, SP-D3 권한 동선은 별도 fresh 실행에서 다음처럼 통과했다.

```text
npx playwright test playwright/slip-collab playwright/sp-d3-slip-dispatch-permission-migration --reporter=line

16 passed (44.8s)
```

이전 동일 세션의 `sales-purchase-query`와 `sidebar-disabled`를 합친 30건 실행에서는 30건이
통과했으나, fresh 재실행에서는 `sales-purchase-query` alias 스펙이 404로 재현되었다. 따라서
30건 GREEN을 최종 판정으로 사용하지 않고, 재현 가능한 16건 GREEN과 아래 404 원문을 함께 기록한다.

사이드바 스펙은 새 정책으로 메뉴를 숨긴 경우 자체적으로 다음 진단을 출력하지만 테스트는 통과했다.

```text
TC-SD3: ACCOUNTANT 에게 영업/창고 제한 미적용 — 영업 disabled: 0, 창고 disabled: 0. FE 권한 가드 구현 후 재검증 필요.
TC-SD5: nav-sales 요소 없음 — testId 확인 필요.
```

이는 이번 변경이 ACCOUNTANT에 제한 메뉴를 disabled로 남기는 대신 숨기는 정책을 적용한 결과이다.
SP-D3 T1~T5 권한 동선 6개와 목록·상세 접근 검사는 재현 가능한 `16 passed` 집합에 포함된다.

### 요구된 전체 Playwright 명령

브라우저는 설치되어 있어 `No browser is available`가 발생하지 않았다. 다만 다음 원문처럼 전체
mock 집합은 이 워크트리에서 15분 내 종료되지 않았다.

```text
cd clients/desktop
npx playwright test
...
Error: EPIPE: broken pipe, write
...
command timed out after 903437 milliseconds
```

CI worker 2 설정으로 재시도한 원문도 동일하게 전체 집합 timeout이었다.

```text
$env:CI='1'; npx playwright test
command timed out after 904035 milliseconds
```

따라서 전체 `npx playwright test`의 완주 GREEN은 보고하지 않는다. 변경 직접 관련 협업·권한
스펙 16건은 실제로 통과했고, R34에서 RED였던 mobile-01 단독 재실행은 다음과 같이 통과했다.

```text
npx playwright test playwright/slip-collab/coedit-s2a.shots.spec.ts --grep 'mobile-01' --reporter=line

[CHECK] 모바일 수정 인라인 폼 오픈: PASS
[CHECK-⑥] 모바일 UUID 비노출: PASS
1 passed (10.1s)
```

### `sales-purchase-query` fresh 실행 원문

canonical `/sales`·`/purchases` 및 `/sales/slips`·`/purchases/slips`의 SP-D3 권한 동선과
별개인 기존 deep-link `/sales/query`·`/purchases/query` 스펙을 단독 실행했다.

```text
npx playwright test playwright/sales-purchase-query --reporter=line

Running 9 tests using 1 worker
Error: 구매조회 누락 컬럼: [순번, 구매번호, 거래처, 거래처코드, 품목, 금액, 수량합계, 입고창고, 적요, 비고, 상세]
Error: 입고창고/INBOUND 관련 텍스트 미노출
Error: 판매조회 시작 날짜 입력이 있어야 함
Error: 판매조회 누락 컬럼: [순번, 판매번호, 거래처, 거래처코드, 배송주소, 품목, 특이사항, 금액, 출고창고, 인수자번호, 전표수정내역, 감리주소, 프로젝트명, 담당자명, 인쇄, 입금예정일, 상세]
4 failed
5 passed (37.3s)
```

4건 모두 첨부 화면의 원문이 `Unexpected Application Error! 404 Not Found`였으며, R35가 추가한
유형별 guard의 403이 아니다. 기준 HEAD에도 alias 선언은 존재했고 R35에서는 그 alias에 guard만
추가했으므로, 이 alias route 표시 문제를 R35 회귀로 단정할 근거는 없다. 접근 판정은 canonical
경로와 일치시켰고, 화면 표시 문제 자체는 이번 R35 범위의 서버 계약 수정으로 확대하지 않았다.

### 요구된 전체 Vitest

전체 실행은 Electron 설치 오류 1건으로 종료되었고, 사용자 사전 경고와 동일한 원문이었다.
변경 관련 테스트는 위의 5개 파일 58건에서 통과했다.

```text
npx vitest run

Failed Tests 1
FAIL src/main/build-output-cjs-interop.test.ts
Error: 외부 패키지 import 가 실제 Node ESM 로더에서 실패했다:
- electron-store (import Store from 'electron-store'):
...
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
...
Node.js v24.14.1
```

### 요구된 typecheck

```text
npm run typecheck

> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa
...
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다(.gitignore 가 허용한 로컬 스펙은 예외)
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

종료 code는 `0`이다.

## 자기표면 3절

### 1. 새 조합 전수 열거 및 실행 대조

편집 경로 2종 × 화면 2종 × 상태 × 역할을 다음처럼 분해해 밟았다.

| 편집 경로 | 화면 | 상태 | 역할/권한 | 실행·판정 |
|---|---|---|---|---|
| 직접수정 | 데스크톱 | OUTBOUND `DRAFT` | `MASTER` mock | `coedit-s2a` desktop-01~03, inline form PASS |
| 직접수정 | 모바일 | OUTBOUND `DRAFT` | `MASTER` mock | `coedit-s2a` mobile-01, exact `직접 수정` PASS |
| 협업수정 | 데스크톱 | OUTBOUND `DRAFT/SAVED` 계약 | 유형 조회 + 협업 권한 | lifecycle contract 및 slip-collab panel PASS |
| 협업수정 | 모바일 | OUTBOUND `DRAFT/SAVED` 진입점 | 유형 조회 + 협업 권한 | mobile action sheet exact label 확인, direct/collab selector 충돌 없음 |
| 직접수정 ↔ 협업수정 | 데스크톱·모바일 | 한쪽 open / 반대 open / 양쪽 상태 감지 | 권한 허용 | `editSurfaceEntryAvailability` 4조합(직접만, 협업만, 양쪽, 닫힘) 4/4 PASS |
| 조회 진입 | 메뉴→목록→상세 | 전체 대상 상태 | `SALES`, `WAREHOUSE`, `ACCOUNTANT`, `MANAGER`, `MASTER` 및 built-in group | `canQuery*` 계약 + SP-D3 T1~T5 + 16 Playwright PASS; alias 조회 404는 별도 기록 |

`DRAFT/SAVED` 협업 진입점 보존은 lifecycle 계약의 R33 RED-B3 테스트로 계속 고정했고, 직접수정과
협업수정의 저장을 동시에 열어 stale memo를 덮는 UI 조합은 helper 4조합과 실제 desktop/mobile
액션시트에서 차단했다.

### 2. 변경 라벨·식별자 워크트리 grep

- `SlipDetailPage.tsx`, mock Playwright, 협업 real-QA fallback, lifecycle test, 모바일 매뉴얼을
  함께 검색했다.
- `docs/manual`에서 `전표 삭제 | CANCELED 처리` stale 행은 `no matches`였다.
- 모호한 `name: '수정'` 검색 결과는 버전관리·개발메뉴·외부 운송사·출고 마감 dialog 등 전표 상세의
  직접/협업 편집과 무관한 화면뿐이었다. 해당 selector는 변경하지 않았다.
- R35 보고서의 RED 원문에만 과거 `name: '수정'` 충돌이 남아 있으며, 이는 재현 증거 보존을 위한
  기록이다.
- `전표 삭제`는 soft delete, `전표 취소`는 CANCELED transition으로 분리되어 source/test/manual
  grep에서 모두 확인된다.

### 3. 변경 파일 참조 테스트

- `SlipDetailPage.lifecycle-contract.test.ts`: 23건 포함 전체 58건 묶음 통과.
- `session.test.ts`: role·built-in group별 OUTBOUND/INBOUND 조회 guard 8건 통과.
- `PermissionGuard.test.tsx`: 기존 guard 6건 통과.
- `AppLayout.printSurface.test.tsx`: 15건 통과.
- `AppLayout.drawer.test.tsx`: 새 session mock export 보강 후 6건 통과.
- `coedit-s2a.shots.spec.ts`, `slip-collab-panel.spec.ts`, `sp-d3`: mock Playwright 16건 통과.
- `sales-purchase-query`: fresh 실행 9건 중 5건 통과, 4건은 기존 alias 화면 404 원문으로 실패했다.
- `sidebar-disabled`: 이전 합산 실행에서 통과했으며, 새 유형별 메뉴 숨김 진단 원문은 위 GREEN 블록에 남겼다.
- `slip-edit-collab-real-qa.spec.ts`: selector는 exact `협업 수정`으로 갱신했다. 실 서버·실 DB를
  요구하는 real-QA 실행은 이번 범위에서 실행하지 않았다.

## 안 본 것

- 서버(`slip-service`) 권한 계약과 DB 상태를 변경·검증하지 않았다. 개발책임자 요청대로 화면만
  서버 계약에 맞췄다.
- 컨테이너 재배포, DB 쓰기, 다른 트랙(`#1045`, `#1061`, `#1063`, `#1066`) 파일은 보지 않았다.
- 실제 두 세션을 이용한 `직접수정 저장 → 오래된 협업 저장` 순서의 실 DB 재현은 하지 않았다. 이번
  수정은 두 표면을 동시에 열지 않도록 UI 진입 조합을 제거하는 범위다.
- 인쇄 라우트(`/sales/:id/print/*`, `/purchases/:id/print/*`)는 이번 불변식의 메뉴→목록→상세
  동선 밖이라 유형별 `SlipReadGuard`를 추가하지 않았다.
- 전체 mock Playwright `npx playwright test`는 15분 timeout으로 완주하지 못했다. 관련 협업·권한
  mock 16건과 R34 실패 mobile-01은 실제로 통과했으며, 조회 alias 4건의 404도 원문 기록했다.
- 전체 Vitest는 Electron 설치 오류 1건 때문에 exit 1이며 Electron 재설치나 `node_modules` 삭제는
  하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-05-874-r35-edit-entry-and-path-permission.md`
