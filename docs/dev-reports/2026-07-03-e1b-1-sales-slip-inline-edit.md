# E1-b-1 매출 전표 상세 품목행 인라인 편집 (E1-b 분할 1/2)

- **PR**: #703 · **일자**: 2026-07-03 · **구현**: Codex(gpt-5.5) · **리뷰/fix**: 순차 듀얼리뷰(Opus 5-agent + Codex)

## 목표 (개발책임자 확정)
전표 상세 매출(OUTBOUND) '수정' 클릭 시 **별도 모달 대신 상세화면 인라인 편집**. linesEditable=DRAFT/SAVED. 매입(INBOUND)=E1-b-2 후속. 협업(collabEditMode)=범위 밖.

## 구현 (Codex)
매출 편집 `<Modal>`→상세화면 인라인 `<section>`(`salesEditOpen && OUTBOUND` 시 read-only 10컬럼→편집 7컬럼 스왑). testid(`sales-slip-edit-*`)·coedit provider effect·낙관락 updatedAt·409/422·행추가 부재 보존. 매입 Modal·협업 무변경. 라이브 스펙(slip-collab-panel·coedit-s2a) dialog→인라인 갱신.

## ⚠️ 개발책임자 morning 확인 (권장방향 진행)
편집 중 라인 = 7컬럼(품목/모델명/규격/수량/**단가(VAT제외)/합계(VAT제외)**), read-only는 10컬럼(VAT포함·공급가액·부가세) 유지. VAT 분해 편집 미표시 — 다른 방향 원하면 조정.

## 순차 듀얼리뷰 — Opus 라운드1 적발·fix (Opus 직접, coedit 회귀 최우선 검증)
- **[BLOCKING·Design/FE·데이터무결성]** read-only 전용 툴바(재고조회+선택라인 **행삭제**)가 인라인 편집 중에도 활성 — 행삭제=draft 우회 즉시 BE DELETE → stale draft 저장 시 409("다른 사용자") 오인(FE 라이브 재현: `DELETE /slips/{id}/lines/{lineId}` 실발행). → **편집 중 툴바+전표라인 h4 숨김**(`!(salesEditOpen&&OUTBOUND)`).
- **[BLOCKING·Design + MED·DevOps/FE]** '수정' 클릭 시 인라인 폼이 fold 아래 렌더인데 auto-scroll/피드백 없음 → 사용자 편집 진입 미인지(구 모달=fixed 오버레이 대비 회귀). → **salesEditOpen useEffect: scrollIntoView + 첫 입력 focus + 라인선택 초기화**.
- **[HIGH·Design]** 편집 컬럼 VAT 라벨 부재(단가 110,000→100,000 raw 혼란). → **"단가(VAT제외)"/"합계(VAT제외)" 라벨**.
- **[MED·Design]** 저장/취소 미고정(긴 표 스크롤) → **sticky 헤더**. 편집중 신호 약함 → **brand accent 좌측바+틴트**.
- **[LOW·Design]** global.css 하드코딩 → 토큰(`--color-bg`/`--radius-lg`). **[NIT]** dead CSS(`.sales-edit-field-grid`) 제거·heading dup(전표라인 h4) 해소.

## 검증
- typecheck(node+web) 통과 · Playwright **12/12**(`slip-collab-panel` 5[S2a inline form]·`coedit-s2a.shots` 2·`sp-08-6-2` 매출계약 5) · `sp-08-5-2`(매입 무회귀) 유지.
- **라이브 GUI QA — 2세션 coedit**(real-qa `e1b1-sales-inline-edit-real-qa`, mock OFF·:8080·dev_master, 실 DRAFT/SAVED 매출 슬립, slip-service 재빌드본): 세션A '수정'→**인라인 폼 auto-scroll(폼 y<400)+accent 편집중 신호+sticky 저장/취소+VAT제외 라벨+툴바 숨김** 실캡처 → 세션A 협업메모 입력 → **세션B 가 SSE 로 동일 값 수신**(coedit 보존 실증) `docs/qa/e1b1-sales-inline-edit/`.

## 백로그 (비차단·후속)
- **[HIGH→후속] 모바일 인라인 편집 카드화**: 편집 표가 모바일서도 데스크톱 표(가로스크롤) — **pre-existing 모달 한계**(신규 회귀 아님), E1-b 모바일 개선 후속.
- **[MED] 헤더 필드 그룹/순서**(거래처코드 편집에만) — pre-existing 모달 필드셋. E1-b-2 공유화 시 정비.
- E1-b-2(매입 인라인) · a11y(ESC/backdrop 취소) · coedit-s2a 목 캡처 스크롤(실 2세션 QA 로 대체됨).
