# 배치 B1-B — DS 독립 a11y/layout 하드닝 (기획 spec v2)

> OPUS 기획 · 백로그 번다운(B1-A 후속). **CODEX SOL 기획검수 R1(BLOCKING 4·1 PR 적정) 반영 v2.** 대상 **#828**(LineRow role=row orphan)·**#842**(Warehouse DOM/ARIA)·**#843**(matchBadge 클립). 설계 방향 SOL 확인·아래 계약 고정.

## 1. 결정

### D-B1B-01 (#828·axe serious) LineRow `role="row"` 제거 + 데스크톱/모바일 IDREF 정합
`role=row/cell`·`aria-selected` 제거에 의존하는 운영 CSS/JS 없음(선택=checkbox `checked`+`.selected` class). **범위(SOL 소비처 전수)**:
- `LineRow.tsx`(운영 소비처 SlipForm 1): 외곽 `role="row"`·`aria-selected`·row-level `aria-describedby` 제거. `priceChangedStatusId`(단가 변경)를 **단가 input `aria-describedby`에 가격출처 ID와 병합**(복수 IDREF `"priceStatusId priceChangedStatusId"`).
- `LineTableHeader.tsx`: `role="row"` 제거(주석 "thead 행"→"시각적 grid header" 정정).
- `EstimateLineRow.tsx`(**운영 소비처 0**·DS test/story만·주석의 EstimateForm/order-app 사용 stale→정정): 외곽/자식 `role=row/cell` 제거(defect-family).
- **[SOL HIGH] `SlipMobileLineCard`(SlipFormPage.tsx:195) 모바일 분기 동일 PR fix**: generic card 무효 row-level `aria-describedby` 제거 + **모바일 단가 input 에도 가격출처+변경상태 ID 병합**(데스크톱만 고치면 모바일 "단가 변경" 미전달). EstimateForm 모바일/데스크톱 redundant container IDREF 제거=MED(여력 시).
- **[SOL HIGH] 기존 QA 테스트 갱신**: `playwright/809-price-memory-real-qa/price-memory-r2-live-real-qa.spec.ts`가 `[role="row"]`로 강조행 찾고 row `aria-describedby` 단언 → **`data-line-number`/class 로 행 찾고 실 단가 input 복수 IDREF 검증**으로 갱신.
- LineRow 상단 a11y 주석(`role=row+aria-selected`) 갱신(MED). LineRow/EstimateLineRow 컬럼수 주석(9/12→10) 정리(LOW).

### D-B1B-02 (#842·D-S3-04) Warehouse DOM/ARIA opaque + **hasListbox 완전 계약**
Warehouse=동기·로컬 후보라 AsyncAutocomplete 통합 아닌 **패턴 이식**(최소안): `key={w.id}`·선택비교·`onChange(w.id,w)`·키보드 index 유지, **DOM id 만 `optionDomId(index)`(opaque `-opt-N`)** 로 분리(UUID/code DOM 유출 차단).
- **[SOL BLOCKING-2] 후보 0건 ARIA 완전 계약**: 현재 `aria-expanded={open}`·`aria-controls={open?listId}`는 빈 결과서도 활성. AsyncAutocomplete 선례처럼 `const hasListbox = open && candidates.length > 0` 단일 조건을 **`aria-expanded`·`aria-controls`·`aria-activedescendant`·listbox 렌더 전부**에 사용.
- **파급 4파일·6 mount**(SlipForm 2·TransferForm 2·SalesPartnerOrderDetail 1·MergeConvertDialog 1·배차 route 직접 소비 없음)·DOM option id 의존 소비처 테스트 없음.

### D-B1B-03 (#843) matchBadge 클립 — JSX sibling + **정밀 CSS 계약**
Partner/Product 별도 복제 `HighlightedPartnerField`/`HighlightedProductField` 동일 결함. 텍스트 wrapper와 badge를 sibling 분리 + **[SOL BLOCKING-3] CSS 계약 고정**(outer에 overflow 남기면 재클립):
- outer field: `display:inline-flex; align-items:baseline; min-width:0` · **outer `overflow:hidden`/ellipsis 금지**
- text wrapper: `flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`
- badge: `flex:0 0 auto`
- 기존 primary/secondary flex 배분 유지 · **Partner tertiary(사업자번호)도 `min-width:0`·shrink 가능**(긴 사업자번호가 option 밀지 않게)

## 2. 검증 ([SOL BLOCKING-4] CI hard gate 명시)
- **#828**: `@axe-core/playwright` **desktop devDependency 도입**(DS 아님). **CI 포함 일반 desktop Playwright spec**(real-qa 경로 아님·CI 제외됨)에서 실제 SlipForm `.sfp-line-table` include→`aria-required-parent` violation **0** 단언. DS 단위테스트: LineRow/Header/EstimateLineRow 외곽 role/aria-selected 없음·**단가 input IDREF 4케이스**(가격출처만/변경만/둘다 복수 IDREF/없음·각 실존요소 지시)·checkbox accessible name·checked·`.selected` 유지.
- **#842**: DS vitest 단위테스트 hard gate — option id 정확히 opaque `-opt-N`·UUID/code가 **id/IDREF 속성**에 없음(보이는 텍스트는 허용)·ArrowDown active id 실존 option·Enter+mouse `onChange(id,object)`·React key `w.id`·후보 0건 expanded=false·controls/active 없음·listbox 없음·status 존재.
- **#843**: 같은 CI 일반 spec에서 **실제 `/sales/new` Partner/Product render**(또는 fixture wrapper 폭 명시)·**360/390px**·5종 텍스트(Partner 상호/코드/사업자번호·Product 모델명/품목명) 각 badge visible + bbox 좌우상하 option bbox 내부(~0.5-1px tolerance)·1440px 텍스트/separator 순서·필드 노출 유지. 기존 `splitHighlightMatches`·`matchBadge` 대비 테스트 hard gate 유지.
- **공통**: 신규 테스트 `test.skip`/조건부 return 금지·**skipped=0**. 전체 DS/desktop vitest·typecheck 유지.

## 3. 워크플로우 (풀 캐논)
OPUS 기획(본 spec v2·PR #858) → CODEX SOL 기획검수(R1 BLOCKING 4→v2·재검수 GO) → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green(axe·mock·bbox hard gate) → 머지·#828/#842/#843 close.

## 4. 스코프
독립 a11y/layout 3건 + Slip 모바일 분기(#828 계약 완결) 한정. 자동완성 상태/계약(B1-A)·재설계 = 밖.
