# 슬4 — 타배송사 인쇄 배차의뢰서 (PRINT/BOTH) Implementation Plan

> **실행 = canonical workflow([[feedback_canonical_workflow]])**: Opus 기획+조기PR → **Codex 개발** → Opus·Codex 순차 듀얼리뷰(각 라운드 단계별 라이브QA 스샷) → 0수렴 → PM 종합 게시 → 머지. Claude 직접 구현 금지(리뷰 라운드 fix 예외). 체크박스(`- [ ]`) 추적. **슬4 머지 시 검수완료→배차발송 에픽 완결.**

**Goal:** 타배송사 발송 채널에 **PRINT/BOTH** 지원 — 발송 건을 **A4 배차의뢰서**(기사/배송사명·배송지·품목요약·수령자·연락처·날짜)로 인쇄/PDF. SMS 본문과 동일 정보.

**Architecture:** slip-service `ExternalDispatchService` 채널 검증 확대(SMS→SMS|PRINT|BOTH) + 채널별 발송 정책 + 인쇄 데이터 조회 엔드포인트(`GET /admin/external-dispatches/{id}/print-data`, external_dispatch+slip fetch). FE: `PrintLayout`(a4-portrait, approvalDoc=false) + 신규 `ExternalDispatchRequestDocument`(출고전표 `DispatchDocument` 패턴 변형 — 결재란 없음·기사/배송사명 명시) + 인쇄 라우트(`DispatchView` 패턴) + `ExternalCarrierDispatchModal` 채널 선택(SMS/PRINT/BOTH) + PRINT/BOTH 시 인쇄 라우트 진입. **Flyway 신규 없음**(channel enum PRINT/BOTH·status는 V50 기정의).

**Tech Stack:** Spring Boot 3 / Java 17 / JPA(slip-service); React + TS + PrintLayout/@media print(clients/desktop). Testcontainers IT, vitest, renderToStaticMarkup 단위테스트.

## Global Constraints
- **Flyway 신규 없음** — `external_dispatch.channel` enum(SMS/PRINT/BOTH)·status(SENT/FAILED) V50 기정의. 마이그 추가 0.
- **채널 정책(D-EDP-02)**: **PRINT**=인쇄 전용(SMS 호출 스킵), status=SENT 항상(인쇄=출력물, 실패 없음) + slip DISPATCHED 전이. **BOTH**=SMS 발송(`sendExternalSmsWithResult` 결과로 status/전이 결정 — SENT→DISPATCHED / FAILED→미전이 재시도) + 인쇄 데이터 제공. **SMS**=슬3 그대로. (BOTH SMS 실패 시: status=FAILED·slip 미전이, 인쇄 데이터는 여전히 제공 — 운영자가 인쇄물로 처리 가능, 단 공식 발송신호=SMS.)
- **권한**: 발송·인쇄 모두 기존 `dispatch.board` 재사용(인쇄 라우트=view, 발송=create). **신규 page-code/시드 0**.
- **UUID 비노출**([[uuid-no-user-visibility]]): 인쇄 양식 사용자 노출=배송사명/기사/배송지/수령자/slipNo. external_dispatch.id/slip_id 미노출(`DispatchDocument.test` 패턴 — `renderToStaticMarkup` 후 `not.toContain(id)` 단언).
- **인쇄 양식 반복 원칙**([[feedback_print_design_iteration]]): 단번 완성 금지. 슬4=1차 양식 + 라이브 캡처. 개발책임자 이미지 피드백 기반 CSS 미세조정은 후속 iteration(슬4 내 또는 후속).
- **재사용**: `PrintLayout.tsx`(a4-portrait shell+포맷헬퍼), `printUtils.ts`, `useFitOneA4.ts`(품목 다량 자동축소), `global.css` @media print(.paper-a4-portrait 12mm), `DispatchDocument.tsx`/`DispatchView.tsx` 패턴. SMS 본문 정보=`ExternalDispatchSmsComposer`와 동일 필드.
- Role 풀네임 · 한국어 커밋/PR · `[FEAT]` · 단계별 다수 스샷 QA · docs 동기화.

## File Structure
**slip-service (BE)** — 수정: `service/external/ExternalDispatchService.java`(채널 분기 dispatch), `web/external/ExternalDispatchController.java`(print-data 엔드포인트). 신규: `dto/external/ExternalDispatchPrintDataResponse.java`(carrier + slips[] 상세), `repository/external/ExternalDispatchSlipRepository.java`(fetch 조회 — 기존). 테스트: `it/external/ExternalDispatchControllerIT.java`(PRINT/BOTH + print-data IT 추가).
**clients/desktop (FE)** — 신규: `print/ExternalDispatchRequestDocument.tsx`(A4 양식), `print/ExternalDispatchRequestView.tsx`(인쇄 라우트), `print/ExternalDispatchRequestDocument.test.ts`. 수정: `routes/index.tsx`(인쇄 라우트), `api/externalDispatch.ts`(channel 선택 + print-data fetch), `routes/dispatch-board/components/ExternalCarrierDispatchModal.tsx`(채널 SMS/PRINT/BOTH 선택 + PRINT/BOTH 인쇄 진입), `api/mock.ts`(채널 + print-data 핸들러).

---

## Task 1 — BE: ExternalDispatchService 채널 분기 (SMS/PRINT/BOTH)
**Files:** `ExternalDispatchService.java`(M) · `ExternalDispatchControllerIT.java`(Test)
**Interfaces (Consumes):** 슬3 ExternalDispatch/Slip.markDispatchedExternally/NotificationClient.sendExternalSmsWithResult. (Produces): `dispatch(CreateExternalDispatchRequest, sentBy)` 채널별 분기.

- [ ] **Step 1: 채널 검증 확대** — 현 `dispatchBySms`(channel!=SMS면 INVALID_INPUT, line 51-54)를 `dispatch(req, sentBy)`로 일반화. SMS|PRINT|BOTH 허용(그 외 INVALID_INPUT).
- [ ] **Step 2: 채널별 발송 로직** — carrier 활성·slips 검증(row lock 그대로) + ExternalDispatch.create(channel) + addSlip 공통. 분기: **PRINT** → SMS 호출 없음, `sent=true`(인쇄 출력물) → 전 slip markDispatchedExternally + markSent(now) + status SENT. **BOTH** → `sendExternalSmsWithResult`(SMS) 결과로 슬3와 동일(성공 markDispatchedExternally+SENT / 실패 markFailed 미전이). **SMS** → 슬3 그대로. (PRINT/BOTH 모두 인쇄 데이터는 응답에 dispatchId 포함 → FE 인쇄.)
- [ ] **Step 3: IT** — ExternalDispatchControllerIT에 추가: ① PRINT 발송 → SMS @MockBean 미호출 + slip DISPATCHED + external_dispatch(channel=PRINT,status=SENT) ② BOTH 발송 → SMS 호출 + (SENT→DISPATCHED) ③ BOTH SMS 실패(@MockBean false) → status FAILED + slip 미전이. (NotificationClient @MockBean.)
- [ ] **Step 4: 커밋**(Claude 대행).

## Task 2 — BE: 인쇄 데이터 조회 엔드포인트
**Files:** `ExternalDispatchPrintDataResponse.java`(C) · `ExternalDispatchService.java`(M, getPrintData) · `ExternalDispatchController.java`(M) · IT(Test)
**Interfaces (Produces):** `GET /admin/external-dispatches/{id}/print-data` → ExternalDispatchPrintDataResponse(carrierName·carrierPhone·dispatchDate·channel·items[]{slipNo·deliveryAddress·recipientName·recipientPhone·itemSummary}).

- [ ] **Step 1: DTO** — ExternalDispatchPrintDataResponse(carrierName·carrierPhone·dispatchDate·channel·List<PrintSlipLine>{slipNo·deliveryAddress·recipientPhone·itemSummary·sequence}). UUID 비노출. 품목요약=ExternalDispatchSmsComposer 로직 재사용(대표 모델명+총수량) 또는 공통 헬퍼 추출.
- [ ] **Step 2: Service.getPrintData(id)** — external_dispatch 조회(soft-delete 가드) + external_dispatch_slip(sequence 순) + slip 상세(findAllByIdInAndIsDeletedFalse, **N+1 회피** 배치 조회) + carrier 조회 → DTO 조립. NOT_FOUND 가드.
- [ ] **Step 3: Controller** — `GET /admin/external-dispatches/{id}/print-data` `@RequirePermission(page="dispatch.board", action=VIEW)`. ApiResponse.
- [ ] **Step 4: IT** — 발송 후 print-data 조회 → carrier/slips 상세 정합 + UUID 미노출. 커밋.

## Task 3 — FE: A4 배차의뢰서 양식 + 인쇄 라우트
**Files:** `print/ExternalDispatchRequestDocument.tsx`(C) · `print/ExternalDispatchRequestView.tsx`(C) · `print/ExternalDispatchRequestDocument.test.ts`(Test) · `routes/index.tsx`(M) · `api/externalDispatch.ts`(M)
**Interfaces (Consumes):** Task2 print-data.

- [ ] **Step 1: api** — `fetchExternalDispatchPrintData(id): Promise<ExternalDispatchPrintDataResponse>` (GET /print-data) + 타입.
- [ ] **Step 2: ExternalDispatchRequestDocument.tsx** — props-only(DispatchDocument 패턴). A4 배차의뢰서: 제목"배차의뢰서" + 배송사/기사명·연락처 + 발송일 + 전표별 행(slipNo·배송지·수령자·연락처·품목요약). 결재란 없음(approvalDoc=false). 안내 문구. UUID 미노출. krDate/printUtils 재사용.
- [ ] **Step 3: ExternalDispatchRequestView.tsx** — 라우트 `/dispatch/external-dispatch/:id/print`. useParams id → useQuery(fetchExternalDispatchPrintData) + usePageTitle. PrintLayout paper="a4-portrait" approvalDoc={false} + useFitOneA4(items 길이) + 상단 no-print 액션바(돌아가기/인쇄 window.print). 404 배너.
- [ ] **Step 4: routes/index.tsx** — `/dispatch/external-dispatch/:id/print` → PermissionGuard(pageCode="dispatch.board", action="view") > ExternalDispatchRequestView.
- [ ] **Step 5: ExternalDispatchRequestDocument.test.ts** — renderToStaticMarkup(mock print-data) → 배송사명/slipNo/배송지 노출 + **UUID(id) not.toContain** 단언(DispatchDocument.test 패턴). 빈 items/다건.
- [ ] **Step 6: 커밋**(Claude 대행).

## Task 4 — FE: 채널 선택 UI + 인쇄 진입 + mock
**Files:** `ExternalCarrierDispatchModal.tsx`(M) · `api/externalDispatch.ts`(M) · `api/mock.ts`(M) · `ExternalCarrierDispatchModal.test.ts`(Test)

- [ ] **Step 1: 채널 선택** — ExternalCarrierDispatchModal 채널 고정 'SMS' → SMS/PRINT/BOTH 선택(radio 또는 select). dispatchExternalSms→dispatch({carrierId,slipIds,channel}) 일반화.
- [ ] **Step 2: 인쇄 진입** — 발송 응답(dispatchId + channel). PRINT/BOTH 성공 시 "배차의뢰서 인쇄" 안내/버튼 → `/dispatch/external-dispatch/{dispatchId}/print` navigate(또는 새 창). SMS는 기존(인쇄 없음). resolveDispatchFeedback 채널 반영(PRINT=인쇄 안내, BOTH=SMS+인쇄).
- [ ] **Step 3: mock.ts** — POST /admin/external-dispatches 채널별(PRINT=status SENT 무조건, BOTH=[발송실패] FAILED 시뮬 유지) + GET /admin/external-dispatches/{id}/print-data(carrier+slips mock). 3원칙.
- [ ] **Step 4: vitest** — 채널 선택, PRINT/BOTH 시 인쇄 진입(dispatchId 라우트), resolveDispatchFeedback 채널 분기, canAccess. typecheck+vitest GREEN.
- [ ] **Step 5: 커밋**.

## Task 5 — docs 동기화
- [ ] README/ROADMAP/overview에 슬4(인쇄 배차의뢰서) + **에픽 완결** 반영 + dev-report `docs/dev-reports/2026-06-24-external-dispatch-print-s4.md`(3-layer).

## QA (각 리뷰 라운드 Docker 라이브 + 단계별 다수 스샷)
①발송대기 목록 ②전표 선택+채널 PRINT(또는 BOTH) 선택 ③기사선택 ④발송 ⑤배차의뢰서 인쇄 화면(A4 양식 — 배송사/기사·배송지·품목·수령자) ⑥(BOTH) SMS 결과 ⑦전표 DISPATCHED 이탈. 실 게이트웨이:8080·mock OFF·각 단계 캡처. 인쇄=window.print 미리보기 캡처(실 PDF/인쇄 다이얼로그). 가짜 금지.

## Self-Review (spec §5 대조)
- 채널 PRINT/BOTH(§5) = Task1. A4 배차의뢰서 양식(SMS 동일정보+기사명, §5) = Task3. 채널 선택 UI = Task4. ✓
- Flyway 신규 0(enum 기정의), 권한 재사용(신규 시드 0), UUID 비노출, 인쇄 양식 반복원칙. ✓
- BOTH SMS 실패 정책 명시(D-EDP-02). 인쇄 데이터 N+1 회피(Task2). ✓
- 에픽 완결(슬1~4) — 슬4 docs에 명시. ✓
