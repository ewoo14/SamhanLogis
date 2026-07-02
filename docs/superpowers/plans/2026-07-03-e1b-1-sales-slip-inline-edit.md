# E1-b-1 매출 전표 상세 품목행 인라인 편집 계획 (E1-b 분할 1/2)

> 구현=Codex(PM 직접구현 금지 [[feedback_pm_no_direct_implementation]]). 조기 OPEN PR→Codex 개발→Opus 5-agent+직접fix+**2세션 라이브 QA(SSE coedit)**게시↔Codex 5-agent+fix+게시 0수렴→PM종합→CI green→머지. 캐논 [[feedback_canonical_workflow]]·매 라운드 라이브 GUI 스샷.

**Goal(개발책임자 확정):** 전표 상세 '수정' 클릭 시 **별도 모달 대신 상세화면 인라인 편집**. linesEditable=DRAFT/SAVED. **본 슬라이스=매출(OUTBOUND)만**(매입=E1-b-2 후속). 협업(`collabEditMode`, 11종 자유필드)은 범위 밖.

**⚠️ 개발책임자 morning 확인 (권장방향으로 진행):** 편집 중 라인 테이블 컬럼셋 = **현 모달과 동일(품목/모델명/규격/수량/단가/합계 7컬럼, VAT 분해 없음)**. read-only(비편집)는 기존 10컬럼(VAT포함·공급가액·부가세 분해) 유지 → 편집 토글 시 **테이블 통째 스왑**. (근거: 모달 선례·VAT분해 라이브편집 복잡·저장 후 read-only 에서 분해 표시.) 다른 방향 원하면 morning 조정.

## 정찰 근거 (2026-07-03, E1-a 머지 후)
- 매출 '수정' 진입: 데스크톱 `sales-slip-edit-button`(SlipDetailPage.tsx ~1400)·모바일 시트(~1553) → `syncSalesFormFromData`+`setSalesEditOpen(true)` → **매출 편집 모달**(`<Modal size="xl" data-testid="sales-slip-edit-modal">` ~2965-3227: footer 취소/저장 ~2974, 배너 ~3020, 헤더 grid ~3042, 라인 ~3141).
- 재사용(무변): `CollaborativeSlipInput`(coedit 셀), `createDocCoeditProvider`, seed(`seedSlipCoeditProvider`·`toPurchaseEditLines`·`coeditLinesToEditLines`), `salesUpdateMutation`(~625, 낙관락 updatedAt·409/422), `syncSalesFormFromData`, `updateSalesLine`/`removeSalesLine`(~3497/3503).
- coedit provider effect(~920): `enabled = !!slipData && (salesEditOpen||purchaseEditOpen)`, deps 에 detailQuery.data(SSE invalidate 시 재생성). read-only 라인표(데스크톱 ~2148, 모바일 카드 ~2235).

## Tasks (Codex 구현 — 매출만)
### Task 1 — 매출 편집 모달 → 인라인
- `<Modal>` 껍데기 제거, 편집 폼(헤더 grid + 라인 7컬럼 테이블 + 취소/저장 + 배너)을 **상세 라인 영역(read-only 표 자리)에 조건부 인라인 렌더**(`salesEditOpen && mode==='OUTBOUND'` 시 read-only 표 대신 편집 폼). testid 유지(`sales-slip-edit-*`)로 계약테스트 보존 — dialog role 만 사라짐(라이브 스펙 갱신은 Task4).
- 진입점 onClick(데스크톱 ~1400·모바일 ~1553): `setSalesEditOpen(true)` 유지(인라인 토글로 동작). 취소=`setSalesEditOpen(false)`.
- 저장/배너/재로드: 인라인 위치로. disabled 조건(`slipFormCoeditPending` 등) 보존. 낙관락 updatedAt·409/422·reload 핸들러 무변.

### Task 2 — coedit 보존 (회귀 핵심)
- provider effect enable 게이트(`salesEditOpen||purchaseEditOpen`)·sync effect 게이팅·deps **동작 보존**(인라인 전환이 coedit 마운트/teardown 의미 변경 없게). 편집창이 길어져도 기존 detailQuery.data 재생성 거동 이상 악화 없게(가능하면 편집 중 provider 재생성 시 로컬 입력 보존 확인). **매입(purchaseEditOpen) 경로는 이번 미변경**(여전히 모달) — 게이트에 잔존 OK.

### Task 3 — read-only↔편집 테이블 스왑
- 비편집: 기존 10컬럼 read-only(VAT분해·redline·재고조회 체크박스) 유지. 편집(salesEditOpen): 7컬럼 편집표(CollaborativeSlipInput). 행추가 미도입 유지(계약테스트 `not.toContain('addSalesLine')` 준수 — 매출도 동일 부재 유지).

### Task 4 — 라이브 스펙 갱신 + QA
- **라이브 스펙**(dialog→인라인): `slip-collab/slip-collab-panel.spec.ts` "S2a direct edit modal"(~232, `getByRole('dialog',{name:'매출 전표 수정'})`→인라인 스코프)·`slip-collab/coedit-s2a.shots.spec.ts`(~282/400 매출 케이스). 계약테스트(sp-08-6-2)는 문자열/testid 유지로 통과.
- **2세션 라이브 QA**(real-qa mock OFF·:8080·dev_master): 세션A 매출 상세 '수정'→인라인 편집(라인 수정)→세션B 동일 전표 coedit 반영(SSE) 실캡처 + 저장→read-only 복귀. `docs/qa/e1b1-sales-inline-edit/`. dev-report.

## 리스크/주의
- coedit full-form(#674) 이 이 폼에만 마운트 → 인라인 전환이 coedit 실동작 직결(회귀 최우선 검증). 낙관락·409/422·매출/매입 이중(이번 매출만). 라이브 스펙 dialog 의존 2건 필수 갱신.

## Self-Review
- 커버리지: 매출 인라인(Task1)·coedit 보존(Task2)·스왑(Task3)·스펙/QA(Task4). 매입=E1-b-2. 협업=범위밖. ✅
- 주의: ①VAT컬럼 권장방향(morning) ②coedit 보존 ③라이브 스펙 갱신 ④2세션 QA ⑤행추가 부재 유지.
