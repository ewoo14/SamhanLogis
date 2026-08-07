# 2026-08-07 — #1094 S2 공통 복귀 계약 + 입금보고서 reference

## 범위

이번 라운드는 S2만 수행했다.

- `returnTo`: 목록 `pathname + search`를 상세 route state로 전달하고 상세 CTA가 우선 사용
- 필터·페이지: 입금보고서 목록 URL query를 정본으로 사용
- scroll: 목록 `pathname + search`별 session store에 anchor 저장·복원
- 번호 링크: native React Router link + `전표번호 상세 보기` accessible name
- reference: `CashReceiptListPage` / `CashReceiptDetailPage`

S3 canonical route 추가, S4 projection, S5 master-detail, 기존 `[상세]` 버튼 제거는 수행하지 않았다.

## RED-A / RED-B 원문 (고치기 전)

RED 테스트를 먼저 추가했다.

- `CashReceiptListPage.test.tsx`: URL query의 `partnerName`, `kind`, `page`를 목록 state로 복원하고 번호 link accessible name을 요구
- `CashReceiptDetailPage.test.tsx`: `returnTo.path + search`가 상세 목록 CTA에 전달되는지 요구
- `cash-receipt-list.spec.ts`: `RED-A` 필터·페이지·스크롤 → 번호 link → 상세 → 목록 왕복과 `RED-B` 접근성/기존 목록 surface 보존을 요구

변경 전 코드 기준으로 실패해야 하는 원인은 다음과 같았다.

```text
URL query를 읽지 않아 필터는 빈 값이고 page는 0으로 고정된다.
번호 <Link>에 aria-label이 없어 “{전표번호} 상세 보기” 접근성 계약이 없다.
상세의 목록 CTA가 /accounting/admin/cash-receipts 로 고정 이동해 returnTo의 filter/page를 잃는다.
번호 클릭 시 scroll anchor를 저장하지 않아 복귀 후 scroll을 복원할 수 없다.
```

실행 기록:

```text
Command: clients/desktop> npm test -- --run src/renderer/routes/CashReceiptListPage.test.tsx
Result: TEST BODY NOT REACHED
[로컬 파생물 신선도 확인 실패]
- electron-updater가 설치된 node_modules에 없습니다.
- file: 의존 design-system dist이(가) 없습니다.
- Electron main 빌드 산출물 out/main/index.js이(가) 없습니다.

Command: clients/desktop> npx vitest run src/renderer/routes/CashReceiptListPage.test.tsx --reporter=verbose
Result: TEST BODY NOT REACHED
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
Could not resolve 'vitest/config' in vitest.config.ts
```

즉, RED 테스트가 코드 assertion까지 실행되기 전에 현재 워크트리의 로컬 파생물/의존성 게이트에서 차단됐다. 컨테이너 재빌드·재기동이나 의존성 설치는 하지 않았다. Playwright RED-A/RED-B도 같은 스택 보호 조건 때문에 실행하지 않았다.

## 구현 및 동시 GREEN 상태

### 공통 계약

`clients/desktop/src/renderer/utils/returnContract.ts`를 추가했다.

- `getReturnTo(state, fallback)`는 `/`로 시작하는 내부 `pathname`과 `?`로 시작하는 `search`만 허용한다.
- 누락·외부 URL·잘못된 state는 canonical `/accounting/admin/cash-receipts`로 폴백한다.
- `saveScrollAnchor` / `getScrollAnchor`는 `samhan:return-scroll:{pathname}{search}` key로 session storage를 사용한다.
- storage가 제한된 환경에서도 화면을 깨뜨리지 않도록 예외를 삼킨다.

### 입금보고서 reference

- `CashReceiptListPage`가 URL query의 `partnerName`, `slipNo`, `kind`, `from`, `to`, `page`를 읽는다.
- 검색·필터 제거·초기화·페이지 이동은 기존 미지 query(예: mockRole)를 보존한 채 query를 갱신한다.
- 번호 link 클릭 시 `returnTo`를 state로 전달하고 현재 scroll을 저장한다.
- 번호 link의 visible text는 그대로 유지하고 accessible name만 `${slipNo} 상세 보기`로 보강했다.
- `CashReceiptDetailPage`의 `목록` CTA는 state returnTo를 우선하고 직접 진입이면 canonical fallback을 사용한다.
- 목록 mount 시 session anchor가 있으면 `requestAnimationFrame` 후 window scroll을 복원한다.
- 삭제·확정·취소·편집·새로고침 등 기존 액션은 제거하지 않았다.

현재 실행 가능한 동시 GREEN 검증은 로컬 환경 게이트로 불가능했다. 확인된 정적 검증은 아래와 같다.

```text
git diff --check
Result: exit 0
```

따라서 이 보고서의 GREEN은 “코드/테스트 변경은 완료했으나 테스트 runner와 Playwright를 실행하지 못한 상태”로 기록한다. CI 또는 이미 준비된 desktop 의존성 환경에서 다음 명령을 재실행해야 한다.

```powershell
cd clients/desktop
npm test -- --run src/renderer/utils/returnContract.test.ts src/renderer/routes/CashReceiptListPage.test.tsx src/renderer/routes/CashReceiptDetailPage.test.tsx
npm run typecheck
npx playwright test playwright/cash-receipt-list/cash-receipt-list.spec.ts
```

## 필수 3절

### 1. 새 상태·화면 조합과 밟은 결과

| 조합 | 결과 |
|---|---|
| 필터 + page + scroll → 번호 link → 상세 → 목록 CTA | RED-A Playwright로 추가. 실행은 로컬 게이트 차단. 구현은 query/state/session anchor로 연결 |
| 새 탭에서 상세 직접 진입 | state 없음 → canonical 목록 fallback을 구현. 내부 URL 검증도 추가 |
| 뒤로가기 연타 | native Link/history는 유지하고, CTA는 returnTo를 사용. 별도 `navigate(-1)`를 도입하지 않음 |
| 상세에서 또 다른 상세 | 현재 S2 reference의 상세에는 다른 번호 상세 link가 없어 scope 밖. 공통 helper는 nested state를 추측하지 않음 |
| returnTo 없음/위조 | canonical fallback. 외부 absolute URL과 `//` path는 거부 |
| 기존 삭제·인쇄·검수·복원 | reference에서 해당 기존 surface를 제거·개명하지 않음. RED-B에서 목록 주요 surface와 접근성 link를 고정 |

### 2. 제거·이동·개명 식별자 grep 전수

이번 변경에서 제거한 식별자는 `page`/`applied`의 local state setter뿐이며, 각각 URL query 계산과 `updateListSearch`로 대체했다.

```text
rg -n "setPage|setApplied" clients/desktop/src/renderer/routes/CashReceiptListPage.tsx
Result: 잔존 참조 0

rg -n "updateListSearch|returnTo|saveScrollAnchor|aria-label" \
  clients/desktop/src/renderer/routes/CashReceiptListPage.tsx \
  clients/desktop/src/renderer/routes/CashReceiptDetailPage.tsx \
  clients/desktop/src/renderer/utils/returnContract.ts
Result: 신규 계약 참조가 목록·상세·helper에만 존재
```

기존 `목록`, `편집`, `확정`, `취소`, `삭제`, `새로고침` 식별자는 삭제하지 않았다. S3/S4/S5 화면 식별자는 변경하지 않았다.

### 3. 바꾼 파일을 참조하는 테스트 전부

변경 파일과 직접 연결한 테스트는 아래와 같다.

- `clients/desktop/src/renderer/utils/returnContract.test.ts` — returnTo 검증, session scroll 저장/조회
- `clients/desktop/src/renderer/routes/CashReceiptListPage.test.tsx` — URL filter/page 복원, accessible name, 기존 오류/신규 작성 금지
- `clients/desktop/src/renderer/routes/CashReceiptDetailPage.test.tsx` — returnTo 우선 CTA, 기존 상태별 액션/상세 필드/mutation 회귀
- `clients/desktop/playwright/cash-receipt-list/cash-receipt-list.spec.ts` — 기존 목록/kind/link/filter + RED-A/RED-B

실행은 위 로컬 의존성 게이트에서 차단됐으며, 기존 테스트를 수정해 green으로 위장하지 않았다. 기존 테스트의 사용자 경로를 바꾼 것이 아니라 query 정본·accessible name·returnTo 계약을 추가했다.

## 완성한 것 / 못 한 것

### 완성한 것

- S2 공통 returnTo 계약과 안전한 canonical fallback
- session-based scroll anchor 저장/복원
- 입금보고서 목록 URL query 정본화
- 입금보고서 번호 link 접근성 보강
- reference 목록↔상세 returnTo 연결
- RED-A/RED-B 및 helper/route 테스트 추가

### 못 한 것

- 로컬 `npm test`, typecheck, Playwright 실제 GREEN 실행: 의존성/파생물 게이트로 미실행
- S3 canonical 상세 route 일괄 추가
- S4 projection 화면 적용
- S5 master-detail 적용
- 기존 `[상세]` 버튼 전수 제거

## 신규 파일 목록

- `clients/desktop/src/renderer/utils/returnContract.ts`
- `clients/desktop/src/renderer/utils/returnContract.test.ts`
- `docs/dev-reports/2026-08-07-1094-s2-return-contract-and-reference.md`

기존 S1 신규 파일 `docs/dev-reports/2026-08-07-1094-s1-list-screen-inventory.md`는 그대로 유지했다.
