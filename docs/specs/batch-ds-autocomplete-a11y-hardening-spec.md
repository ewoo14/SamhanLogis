# 배치 B1 — DS 자동완성·a11y 하드닝 (기획 spec)

> OPUS 기획 · **백로그 번다운 배치**(2026-07-19 개발책임자 지시: 슬라이스 파생 chore 순증 → 배치 close 로 순감 전환). #825 슬1~3 재수렴 + #820 R8 에서 발굴된 **design-system 자동완성/접근성 pre-existing 하드닝 6건**을 한 슬라이스로 정식 검증·close.
>
> 대상 이슈: **#834**(AsyncAutocomplete debounce/a11y) · **#837**(DocumentReferencePicker 상태머신) · **#840**(selection-confirmed 계약) · **#842**(WarehouseAutocomplete DOM/ARIA) · **#843**(matchBadge 모바일 ellipsis) · **#828**(LineRow role=row orphan).

## 1. 배경·범위
전부 **frontend**(design-system + desktop)·기능안전(크래시/데이터손상 없음)이나 UX/a11y 하드닝 가치. 공통 테마 = 자동완성 DOM/ARIA 식별자·요청 세대 가드·선택확정 계약·배지 레이아웃·행 a11y. **공용 컴포넌트 변경**이므로 [[feedback_design_system_playwright_mock_suite]] 대로 Playwright mock 회귀 스위트가 권위.

## 2. 결정 (issue별)

### D-B1-01 (#828·axe serious) LineRow role=row orphan 해소
`LineRow.tsx:252` `role="row"`가 부모 `role="table"/"rowgroup"/"grid"` 없이 orphan(axe `aria-required-parent` serious). **최소 침습**: LineRow 컨테이너(소비처 `SlipFormPage`·`EstimateCatalog` 등)에 `role="table"`+행 그룹 `role="rowgroup"` 부여, 또는 LineRow 의 `role="row"` 제거가 시맨틱에 맞으면 제거. 전 소비처 무회귀 + axe 재검(serious 0).

### D-B1-02 (#842·D-S3-04) WarehouseAutocomplete DOM/ARIA 도메인식별자 분리
`WarehouseAutocomplete.tsx`의 `Warehouse.id`(:25)가 `aria-activedescendant`(:280)·옵션 `id`(:295-299)에 유입(UUID DOM 노출). 슬3 AsyncAutocomplete `optionDomId(index)`(opaque·index 기반) 패턴 이식 → getKey(업무키) DOM 유출 차단. React key/선택/키보드 보존·ARIA 단위테스트.

### D-B1-03 (#834) AsyncAutocomplete debounce/a11y LOW 하드닝
슬1 재수렴 발굴 5건(전부 pre-existing·기능안전): stale-key·false-empty·activeIndex·aria-controls·terminal-error 계열. 각 항목을 실 코드 재확인 후 최소 하드닝(원자 clear 창·aria-controls/activedescendant 정합·terminal error 표시). ac-* mock 스위트 회귀 게이트.

### D-B1-04 (#837·MED×2) DocumentReferencePicker 요청 세대 가드
`DocumentReferencePicker.tsx`: [MED] 요청 세대 가드 부재(:127)—clear/선택/유형변경 후 이전 in-flight 응답이 후보·open 되살림 → **세대 토큰(requestId) 가드**로 stale 응답 폐기. [MED] 디바운스 창 stale 선택(:145)—이전 후보+activeIndex=0 유지 → 입력 변경 시 후보/activeIndex 원자 리셋. [LOW] `suppressNextSearchRef` 미소비(:135) 정리. → [[feedback_react_query_freshness_route_param_reset]] 정신(세대 latch).

### D-B1-05 (#840·MED) selection-confirmed 계약 — 동명 거래처 우회 차단
`DailyClosingPage`·`admin/BlockedPartnersPage` 가드가 `typedDraft === partner.name`으로 확정 판정하나 **상호는 unique 아님** → 동명 거래처(P1/P2 상호 동일·코드 상이) 우회. **근본 = design-system 계약**: AsyncAutocomplete/PartnerAutocomplete 에 **`isSelectionConfirmed`(마지막 확정 선택의 업무키 보유·입력이 그 후 미변경) 또는 listbox-open 상태 노출** → 소비처 가드가 name-equality 아닌 **확정 선택 id**로 판정. 동명 IT/mock 회귀.

### D-B1-06 (#843·LOW) matchBadge 모바일 ellipsis 클립
`AsyncAutocomplete.module.css` matchBadge(:193)가 ellipsis 필드(:143) 마지막 자식 → 좁은 모바일 폭에서 배지 클립. **텍스트 전용 ellipsis wrapper + `flex-shrink:0` 배지를 형제로 분리**(배지 항상 렌더). Partner/Product 배지 공통·모바일 라이브 QA 시각 확인.

## 3. 상호의존·순서
- D-B1-05(selection-confirmed 계약)는 AsyncAutocomplete 계약 추가 → D-B1-03(#834 a11y)·D-B1-02(#842)와 같은 컴포넌트 계열 → **함께 설계**(계약 1회 추가·소비처 배선). D-B1-01(#828)·D-B1-06(#843)은 독립.
- 공용 base(AsyncAutocomplete) 변경 → **전 소비처 회귀 스위트 필수**(ac-*·5+ 소비처).

## 4. 검증
- **design-system Playwright mock 스위트**(`playwright/ac-*` mock :5173) 권위 — 변경 컴포넌트별 회귀 + 신규(selection-confirmed·warehouse ARIA·docref 세대) 케이스.
- **vitest**(DS + desktop) · **npm run typecheck**(vitest≠tsc) · **axe**(#828 serious 0).
- **모바일 라이브 QA**(#843 배지 시각·#840 동명 우회 차단) — 실 화면 스샷.

## 5. 워크플로우 (캐논·chore도 비예외)
OPUS 기획(본 spec·조기 PR·Closes #834/#837/#840/#842/#843/#828) → CODEX SOL 기획검수 → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green(mock hard gate 포함) → 머지·6이슈 close.

## 6. 스코프 경계
- 6개 하드닝 한정. 자동완성 신기능·재설계 = 밖.
- SOL 기획검수가 배치 과대(한 PR 부적합) 판정 시 2 PR 분할 가능(계약 계열 / 독립 계열).
