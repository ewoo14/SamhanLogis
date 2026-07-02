# E1-b-2 매입 전표 상세 품목행 인라인 편집 (E1-b 분할 2/2)

- **PR**: #704 · **일자**: 2026-07-03 · **구현**: Codex(gpt-5.5) · **리뷰**: 순차 듀얼리뷰(Opus 5-agent + Codex)

## 목표 (개발책임자 확정)
전표 상세 매입(INBOUND) '수정' 클릭 시 별도 모달 대신 상세화면 인라인 편집. **E1-b-1(매출, 머지 `3a9a38848`/#703) 확립 패턴을 매입에 복제**. 매출은 이미 인라인, 협업(collabEditMode)=범위밖.

## 구현 (Codex — 매출 패턴 복제)
매입 편집 `<Modal>`("매입 전표 수정")→상세화면 인라인 `<section>`(`purchaseEditOpen && INBOUND` 스왑). E1-b-1 확립 fix **처음부터 baked-in**:
- 편집중 read-only 툴바 숨김(단일 조건식 `!((salesEditOpen&&OUTBOUND)||(purchaseEditOpen&&INBOUND))` — 행삭제 draft 우회 방지·데이터무결성).
- `purchaseEditFormRef` auto-scroll(block:start)+첫 편집필드 focus(readonly 스킵)+라인선택 초기화(매출 useEffect 대칭).
- 단가/합계 **VAT제외** 라벨+aria-label. brand accent 편집중 신호+sticky 저장/취소(공유 `.slip-edit-inline*`).
- coedit provider effect(enable `salesEditOpen||purchaseEditOpen`)·`purchaseUpdatedAt` 낙관락·409/422·행추가 부재 보존.
- global.css `.sales-edit-inline*`→`.slip-edit-inline*` 공유화(매출/매입 공용, `.sales-edit-inline` alias 유지).

## 순차 듀얼리뷰 — Opus 라운드1 (4차원 전부 BLOCKING/HIGH 0)
패턴 복제라 clean. FE/BE/Design/DevOps 전부 0-blocking/high:
- **매출 무회귀 확인**: `.slip-edit-inline` comma-selector 공유·매출 TSX도 .slip-edit-inline 사용·매출 스펙(sp-08-6-2 5·slip-collab-panel 5·coedit-s2a 2) 재통과(실캡처 육안).
- **매입 인라인 대칭**: handlePurchaseEditSave verbatim·coedit provider 무변·툴바숨김 OR 상호배타·testid(purchase-slip-edit-*) 보존. CI 28/28 green(Desktop Playwright 549·skipped 0).
- **비차단 백로그**(Design LOW·NIT / FE·DevOps NIT): dead `.sales-edit-inline*` shell alias(소비자0)·`.purchase-edit-*`↔`.sales-edit-*` field/memo/lines byte-identical 미공유(drift 위험) → **cosmetic CSS cleanup 후속 PR**(agent 권고). 모바일 편집 카드화·헤더 필드순서 = pre-existing 모달 한계(신규 회귀 아님).

## 검증
- typecheck(node+web)·lint·build·Playwright **매입 sp-08-5-2 5(인라인 계약)·매출 무회귀 sp-08-6-2 5·slip-collab-panel 5·coedit-s2a 2**(FE 55/55 확장 스위트 포함). CI 28/28 green.
- **라이브 GUI QA — 정직 disposition**([[feedback_no_fake_data_ever]] "불가 시 정직 보고"): **seed 에 INBOUND(매입) 슬립 0건**(300건 전부 OUTBOUND: 298 DRAFT+2 SENT) → 매입 실 슬립 라이브 캡처 불가. 매입 인라인은 **라이브 실증된 매출 패턴과 코드 대칭**(리뷰 "byte-identical/verbatim/완전대칭"·shared `.slip-edit-inline`·동일 useEffect/CollaborativeSlipInput) + **매출 2세션 coedit 라이브 QA(#703 `e1b1-sales-inline-edit`)가 공유 인라인+coedit 패턴 실증** + 매입 sp-08-5-2 계약 + coedit-s2a Playwright 통과로 검증. 매입 2세션 coedit real-qa 스펙(`e1b2-purchase-inline-edit-real-qa`) 작성·보존 — **향후 INBOUND seed 데이터 확보 시 실행 가능**.

## 백로그 (비차단·후속)
- **cosmetic CSS cleanup PR**: dead `.sales-edit-inline*` alias 제거 + `.purchase-edit-*`/`.sales-edit-*` field/memo/lines → `.slip-edit-*` 통합.
- 매입 INBOUND seed 데이터 확보 후 `e1b2-purchase-inline-edit-real-qa` 실행.
- 모바일 편집 카드화(pre-existing)·헤더 필드순서(pre-existing)·a11y(ESC/backdrop).
