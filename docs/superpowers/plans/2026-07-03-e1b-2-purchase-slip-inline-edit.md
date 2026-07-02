# E1-b-2 매입 전표 상세 품목행 인라인 편집 계획 (E1-b 분할 2/2)

> 구현=Codex(PM 직접구현 금지). 조기 OPEN PR→Codex 개발→Opus 5-agent+직접fix+라이브 QA게시↔Codex 5-agent+fix+게시 0수렴→PM종합→CI green→머지. 매 라운드 라이브 GUI 스샷.

**Goal:** 전표 상세 **매입(INBOUND)** '수정' 클릭 시 별도 모달 대신 상세화면 인라인 편집. **E1-b-1(매출, 머지 `3a9a38848`/#703) 확립 패턴을 매입에 복제**. 매출은 이미 인라인, 협업(collabEditMode)=범위밖.

## E1-b-1 확립 패턴 (매입에 동일 적용 — 처음부터 반영)
매출에서 Opus/Codex 리뷰로 확정된 fix들을 매입 인라인에 **처음부터 baked-in**(재발 방지):
1. **모달→인라인**: `purchaseEditOpen` Modal("매입 전표 수정") 껍데기 제거 → `purchaseEditOpen && mode==='INBOUND'` 시 read-only 라인표 자리에 인라인 편집 폼. testid(`purchase-slip-edit-*`) 보존(sp-08-5-2 계약).
2. **편집중 read-only 툴바 숨김**: `!(purchaseEditOpen && mode==='INBOUND')` 로 재고조회+선택라인 툴바(행삭제 draft 우회 방지·데이터무결성)+"전표 라인" h4 숨김. (매출 fix와 동일 조건절에 매입 OR 추가 or 별도.)
3. **auto-scroll + focus + 선택초기화**: `purchaseEditOpen` useEffect → `purchaseEditFormRef.scrollIntoView({block:'start'})` + 첫 편집필드(readonly 스킵) focus + setSelectedLineId/setCheckedLineIds 초기화.
4. **VAT제외 라벨**: 매입 편집표 단가/합계 → "단가(VAT제외)"/"합계(VAT제외)" + input aria-label.
5. **accent/sticky**: `.sales-edit-inline*` CSS 재사용(또는 공유 클래스로 일반화) — brand accent 편집중 신호 + sticky 저장/취소.
6. **coedit 보존**: provider effect(enable `salesEditOpen||purchaseEditOpen`)·낙관락(purchaseUpdatedAt)·409/422·행추가 부재 무변.

## Tasks (Codex 구현 — 매입만)
- Task 1: 매입 모달→인라인 (위 1·2·3·4 매입 적용, 매출 코드 패턴 복제).
- Task 2: CSS 공유화 검토 — `.sales-edit-inline*` 를 매입도 쓰도록 공유 클래스명(예 `.slip-edit-inline*`)으로 일반화 or 매입 전용 클래스 추가(중복 최소화).
- Task 3: 영향 스펙 — sp-08-5-2(매입 계약, testid/string 유지)·매입 dialog 라이브 스펙 있으면 dialog→인라인 갱신(grep 확인).
- Task 4: 라이브 GUI QA(real-qa, mock OFF·:8080·dev_master·DRAFT/SAVED 매입 슬립): 매입 '수정'→인라인(auto-scroll+accent+VAT라벨+툴바숨김)+2세션 coedit 실캡처. dev-report.

## 리스크
매출 대비 낮음(패턴 확립). 단 매입/매출 CSS·상태 공유화 시 매출 회귀 주의(매출 인라인 스펙 재통과 확인). coedit·낙관락·매입 계약(sp-08-5-2) 무회귀.

## Self-Review
- 커버리지: 매입 인라인(Task1)·CSS 공유(Task2)·스펙(Task3)·QA(Task4). 매출 무회귀 확인. ✅
- 주의: ①매출 회귀(공유화 시) ②coedit 보존 ③행추가 부재 유지 ④VAT/모바일카드 개발책임자 결정.
