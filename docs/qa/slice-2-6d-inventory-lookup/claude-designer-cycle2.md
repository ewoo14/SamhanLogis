# InventoryLookupModal — Designer 리뷰 Cycle 2

> 작성: 2026-05-31 / Designer agent
> 대상: `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx` (fix commit c07c8d47)
> 기준: `docs/design/inventory-lookup-modal-guide.md`
> 선행: Cycle 1 CHANGES_REQUESTED (P1 5건 + P2 6건)

---

## Cycle 1 P1 해소 결과

### P1-1. 색 토큰화 + 가용>0 의미 색상 — 해소 O

- `--color-*` 독자 네임스페이스 0건 (grep 확인).
- L383-384: 가용=0 → `var(--state-danger, #EF4444)`, 가용>0 → `var(--ink-primary, #1A1F2E)` — 가이드 §7 완전 일치.
- L385: 실재고 → `var(--ink-secondary, #5C6773)`.
- L391: 0셀 공통 deemphasis → `var(--ink-tertiary, #8A95A4)`.
- L115: 토글 라벨 → `var(--ink-secondary)`.
- L166: 로딩 텍스트 → `var(--ink-secondary)`.
- 모든 색 참조가 design-system semantic alias 토큰으로 교체됨.

### P1-2. 예약 warning 분기 — 해소 O

- L387-389: `cell.reserved > 0 ? 'var(--state-warning, #F59E0B)' : 'var(--ink-secondary, #5C6773)'`.
- 가이드 §7 표 "예약>0 → --state-warning / 예약=0 → --ink-secondary" 정확히 구현됨.

### P1-3. 0토글 헤더 우측 배치 — 해소 O

- L97-132: `modalTitle`을 `<span style={{ display:'flex', justifyContent:'space-between', width:'100%', gap:16 }}>` flex row JSX로 구성.
- 좌측 `<span>재고조회</span>` + 우측 `<label>` 체크박스 — 가이드 §3 / §4.1 "헤더 우측, 닫기 버튼 왼쪽" 레이아웃.
- L144: `title={modalTitle}` prop 전달로 Modal 헤더 슬롯 활용.

### P1-4. 제목 "재고조회" + 서브헤더 — 해소 O

- L107: `<span>재고조회</span>` — 정확.
- L135-138: 성공 시 `선택 품목 ${lineCount}건 · 조회 창고 ${colCount}개`, 로딩 시 `선택 품목 ${lineCount}건`.
- L145: `description={modalDescription}` prop 전달 — 가이드 §3 서브헤더 스펙 충족.

### P1-5. th scope/row + caption sr-only + 셀 aria-label — 해소 O

- L265: `<th scope="col"` (품목 고정 헤더).
- L285-286: `visibleCols.map` 내 창고 헤더 전부 `scope="col"`.
- L329: 각 행 품목 열 `<th scope="row"`.
- L249-259: `<caption>` sr-only 인라인 스타일 (position:absolute, width:1, height:1, clip) 적용됨.
- L396: 셀 `aria-label="{modelName} {warehouseName} — 가용 {N} 실 {N} 예약 {N}"` — 가이드 §13 완전 일치.

---

## Cycle 1 P2 해소 결과

### P2-1. sticky 고정 컬럼 + boxShadow 구분선 — 해소 O

- L274-280: thead 품목 열 `position:'sticky', left:0, zIndex:2, boxShadow:'inset -1px 0 0 var(--line-default, #E5E7EB)'`.
- L338-345: tbody 각 행 품목 열 동일 sticky + zIndex:1 + 홀짝 배경색 분기 정확.
- 가이드 §5.2 / §10 완전 충족.

### P2-2. tabular-nums + 라벨 분리 포맷 — 해소 O (방식 동등)

- L423, L447, L471: 가용/실/예약 3행 모두 `fontVariantNumeric:'tabular-nums'` 적용.
- 라벨 분리: CSS `::before` 대신 `<span style={{ minWidth:'2em', fontSize:11 }}>가용</span>` JSX span 사용.
- 가이드 §6.3은 `::before`를 예시로 제시하나 의무 규정 없음. `min-width: 2em` + tabular-nums로 숫자 정렬 달성 — 기능 동등성 충족.

### P2-3. 0셀 텍스트 deemphasis 전면 적용 — 해소 O

- L379: `isZero = cell.total === 0`.
- 가용/실/예약 3행과 각 라벨 span 전부 `isZero ? zeroCellColor('var(--ink-tertiary)') : 개별토큰` 분기 적용.
- L404: 0셀 배경 `var(--surface-subtle, #F4F6F8)`.

### P2-4. data-testid 로딩/에러 — 해소 O

- L162: `data-testid="inventory-lookup-loading"` + `role="status"` + `aria-busy="true"`.
- L182: `data-testid="inventory-lookup-error"` + `role="alert"`.

### P2-5. 빈 상태 문구 가이드 일치 — 해소 O

- L228: `"조회된 재고 창고가 없습니다."`
- L229: `'"0수량 창고도 표시"를 켜면 전체 창고를 확인할 수 있습니다.'`
- 2줄 `<div>` 분리 구조 — 가이드 §4.3 ASCII 다이어그램과 일치.

### P2-6. VIRTUAL 창고 필터 — 해소 O

- L85: `w.warehouseType !== 'VIRTUAL'` 조건이 visibleCols 필터 최상단에 위치.
- showZero ON/OFF 분기 외부이므로 토글 상태와 무관하게 항상 제외 — 가이드 D-IL-04 완전 충족.

---

## 신규 발견 (Cycle 2 — 미지적 잔존 항목)

Cycle 1에서 지적되지 않았으나 이번 파일 대조에서 확인된 항목. 블로킹 없음.

### N1. 셀 숫자 font-size 12px — 가이드 13px 불일치 (P2)

**가이드 §6.2**: 셀 숫자 `var(--font-size-sm)` = 13px, 라벨 `var(--font-size-xs)` = 12px.
실제 구현: 숫자 포함 전체 span `fontSize: 12`, 라벨 span `fontSize: 11`.
숫자가 가이드 대비 1px 작음. 시각적 차이는 미미하지만 토큰 규격 불일치.

수정 제안: 가용/실/예약 숫자 span의 외부 `<span>` fontSize를 12 → 13으로, 라벨 span은 11px 유지.

### N2. 가이드 §7.1 ⓘ 툴팁 미구현 (P3 — 차기 슬라이스)

**가이드 §7.1**: 헤더 "가용" 옆 `ⓘ` 아이콘, hover 시 "가용재고 = 실재고 − 예약재고 (전환 가능 수량)" 툴팁.
현재 구현에 없음. 테이블 셀 포맷이라 헤더 ⓘ 위치 추가 설계 필요. Phase 2.6d 릴리스 블로킹 아님 — 후속 슬라이스 backlog 등록 권장.

---

## 종합 요약

| 구분 | 건수 | 결과 |
|---|---|---|
| P1 블로킹 (Cycle 1) | 5 | 전부 해소 O |
| P2 권장 (Cycle 1) | 6 | 전부 해소 O |
| 신규 N1 셀 숫자 1px | 1 | P2 — 비블로킹 |
| 신규 N2 ⓘ 툴팁 | 1 | P3 — 차기 슬라이스 |

**결론: APPROVE**

Cycle 1 P1 5건 + P2 6건 전부 해소됨. 색 토큰, 예약 warning 분기, 토글 헤더 배치, 제목/서브헤더, th scope/caption, sticky 컬럼, tabular-nums, 0셀 deemphasis, testid, 빈 상태 문구, VIRTUAL 필터 — 11건 전부 가이드 기준 충족.

신규 발견 N1(숫자 font-size 1px)은 비블로킹 P2로 QA 티켓 등록 권장, N2(ⓘ 툴팁)는 차기 슬라이스 backlog. 현 구현은 Phase 2.6d 릴리스 적합 수준.
