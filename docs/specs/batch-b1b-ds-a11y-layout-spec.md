# 배치 B1-B — DS 독립 a11y/layout 하드닝 (기획 spec)

> OPUS 기획 · 백로그 번다운(B1-A 후속). **CODEX SOL B1-A 기획검수/R1 이 이미 #828·#842·#843 해소 방향 상세 제시** — 그 결정을 spec 화. B1-A(#834·837·840·committed 계약) 머지 후 착수(SOL 권고 순서·#840·#843 PartnerAutocomplete 충돌 회피).
>
> 대상: **#828**(LineRow role=row orphan) · **#842**(WarehouseAutocomplete DOM/ARIA) · **#843**(matchBadge 모바일 클립). 전부 frontend·독립(상호 파일 겹침 적음)·기능안전.

## 1. 결정

### D-B1B-01 (#828·axe serious) LineRow `role="row"` **제거**
부모 `role=table/rowgroup` 부여는 불완전(자식이 `role=cell/gridcell` 없는 generic div·`LineTableHeader`도 별도 orphan `role=row`·SlipForm DnD wrapper 개입). SOL 권고 = **최소·정합안 = role 제거**:
- `LineRow.tsx`의 `role="row"`·`aria-selected`·row-level `aria-describedby` 제거.
- `LineTableHeader.tsx`의 `role="row"` 제거.
- `priceChangedStatusId`(단가 변경 상태)를 **단가 input 기존 `aria-describedby`에 병합**(현재 row 에만 연결).
- **공개 DS `EstimateLineRow.tsx`의 잔존 `role="row"`/`role="cell"`도 동일 sweep 포함**(defect-family).
- 테스트의 가짜 `<div role="table">` wrapper(`LineRow.test.tsx`) **제거**(현재 실 생산 결함 마스킹).
- 운영 `<LineRow>` 소비처 = **SlipForm 1곳**(EstimateForm=inline·이미 orphan 제거·EstimateCatalog=비소비). 각 input `라인 N …` a11y 이름·행선택 checkbox 유지.

### D-B1B-02 (#842·D-S3-04) WarehouseAutocomplete DOM/ARIA 도메인식별자 분리
`Warehouse.id`(UUID)가 `aria-activedescendant`·옵션 `id`에 유입 → 슬3 AsyncAutocomplete **`optionDomId(index)`(opaque·index 기반) 패턴 이식**(getKey/업무키 DOM 유출 차단). React key/선택/키보드 보존. ⚠️ **후보 0건 시 `aria-controls`가 없는 listbox 지시 금지**(B1-A #834 동일 ARIA sweep 동반). **ARIA 단위테스트 신설**(Warehouse 현재 전용 단위테스트 부재).

### D-B1B-03 (#843·LOW) matchBadge 모바일 클립 — **JSX sibling 분리**(CSS-only 아님)
`AsyncAutocomplete.module.css` matchBadge 가 ellipsis 필드 마지막 자식이라 좁은 모바일 폭에서 배지 클립. SOL 권고 = **Partner/Product `Highlighted*Field` JSX 에서 텍스트 wrapper 와 badge 를 실제 sibling 으로 분리**:
- outer field·text wrapper 각 `min-width:0`+ellipsis, **badge `flex:0 0 auto`**(항상 렌더).
- 기존 matchBadge 테스트는 **색 대비만** 검사·clipping 미검출 → **badge bounding box 가 option 내부에 완전 포함** 단언(Partner/Product 각·긴 primary/secondary 텍스트).

## 2. 검증 (실 게이트)
- **#828**: 실제 SlipForm **axe `aria-required-parent` 0**(`@axe-core/playwright` 또는 vitest axe·저장소 axe 의존성 부재 시 도입) + fake table wrapper 없는 DS 단위테스트.
- **#842**: UUID/업무키가 option DOM id 에 없음·`aria-activedescendant`가 실제 option 지시·후보 0건 aria-controls 정합. Warehouse ARIA 단위테스트.
- **#843**: Partner/Product 각 긴 텍스트에서 badge bounding box option 내부 완전 포함. **360/390px viewport 명시**(기본 1440 단일).
- 전 DS·desktop vitest·typecheck·`ac-*` desktop Playwright mock(skipped=0)·변경 소비처 무회귀.

## 3. 워크플로우 (풀 캐논)
OPUS 기획(본 spec·조기 PR·Closes #828/#842/#843) → CODEX SOL 기획검수(다회 GO) → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green → 머지·3이슈 close.

## 4. 스코프
독립 a11y/layout 3건 한정. 자동완성 상태/계약(B1-A)·재설계 = 밖.
