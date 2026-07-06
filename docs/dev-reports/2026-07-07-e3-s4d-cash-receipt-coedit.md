# E3 S4d — 입금보고서(CashReceipt) 작성폼/상세 실시간 coedit (born-live)

- PR #755 · 브랜치 `feat/e3-s4d-cash-receipt-coedit`
- 에픽 E3(회계 입금보고서) 마지막 슬라이스. S4a(목록)·S4b(작성폼/상세)·S4c(벌크) → **S4d=coedit**.
- 스펙 `docs/superpowers/specs/2026-07-07-e3-s4d-cash-receipt-coedit.md`.

## 구현
- **FE**: `CashReceiptFormPage` 헤더 필드(거래처/거래일/금액/차·대변계정/메모) `createDocCoeditProvider` 실시간 동시편집. 두 사용자가 같은 DRAFT 입금보고서를 편집폼으로 열면 저장 없이 상대 화면 즉시 반영(born-live). provider 재생성 회피(deps=receiptId/canCollabEdit·쿼리객체 배제). **상세(`CashReceiptDetailPage`)는 읽기전용 Field + "편집" 버튼 네비**(inline coedit 미사용 — 저장경로/검증 이유, 참조 패턴 정합).
- **BE**: `CashReceiptCollabController` + DTO3 + IT — cash-receipt coedit SSE relay(기존 `CollabCoeditService`/`RealtimeBroker` 재사용, `JournalCollabController` 미러). 엔드포인트 GET coedit·POST update/awareness·GET stream. 권한 page=`accounting.cash-receipts` VIEW/UPDATE. 업무게이트 `status==DRAFT && kind!=BANK_LINKED && !isDeleted`.

## 개발책임자 확정 정책 (설계문서)
1. coedit 편집 = **DRAFT 한정**. CONFIRMED/CANCELLED/BANK_LINKED = coedit 비활성.
2. **CONFIRMED 입금보고서는 편집 가능(역분개 재게시)** — coedit 자격(DRAFT)과 편집폼 접근성(bankLinked||CANCELLED만 read-only)을 분리. UPDATE 권한 없으면 read-only.
3. 입금보고서 = 비-원장 자유편집(원장 Journal 미접촉). soft delete.

## 듀얼리뷰 수렴 (BLOCKING/CRITICAL 다수 포착)
- **R1 Opus 5-agent**: BLOCKING2(①상세 인라인 coedit 저장경로 부재="보이는값≠확정값" ②CI RED — "coedit=DRAFT" 과잉적용으로 CONFIRMED 편집 기능 회귀)+HIGH3(계정 free-text·이질적 진입·ci.yml gate 부재) → Opus 직접 fix(상세 coedit 제거·readOnly 복원·ci.yml gate·토큰).
- **R2 Opus 5-agent**: 0수렴.
- **Codex STEP4 5-agent**: 신규 FE 인가결함(UPDATE 권한 없는 사용자 직접 /edit 저장 가능) 포착 → readOnly에 `!canUpdate`. IT 409/404 4엔드포인트 커버리지·배너톤.
- **R3(FE/BE)**: FE LOW(무권한/CONFIRMED 배너 모순 카피) → `canUpdate` 게이트. BE 0(+INFO: collab-SSE 단일-Accept 에러처리=전 코드베이스 사전존재 패턴, 후속).

## 검증
- **라이브 QA**: accounting-service Docker 재빌드 → 실 게이트웨이 :8080·실 JWT로 **2연결 SSE 브로드캐스트 실증**(세션A 구독 중 세션B update POST → 세션A `event:coedit:update` 수신). `docs/qa/e3-s4d-coedit/live-sse-broadcast-roundtrip.txt`.
- `CashReceiptCoeditIT` 7 (실 PG Testcontainers) · vitest 17 · typecheck · CI Playwright(mock) green · Frontend/JUnit green.
- ⚠️ 실-백엔드 단일세션 GUI 스샷은 데스크톱 앱 plain-browser 미마운트(real-qa 하네스 배리어)로 폐기(정직), GUI 렌더는 CI mock green 커버.

## 후속(별도)
- collab-core 공용 SSE 에러 프레임(단일-Accept EventSource) 전 서비스(slip/groupware/accounting) 검토.
- `InMemoryRealtimeBroker` SSE 구독수 상한(공통 broker DoS 정책).
