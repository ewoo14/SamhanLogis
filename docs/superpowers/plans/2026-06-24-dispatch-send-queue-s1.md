# 슬1 — 배차 발송 대기(검수 완료 게이트) Implementation Plan

> **For agentic workers:** 본 계획은 **canonical workflow([[feedback_canonical_workflow]])** 로 실행한다 — Opus 기획+조기PR → **Codex 개발** → Opus·Codex 순차 듀얼리뷰(각 라운드 단계별 라이브 QA 스크린샷 인라인) → 0수렴 → PM 머지. superpowers 기본 subagent/inline 실행이 아니라 **Codex 가 구현**(Claude 직접 구현 금지, fix는 라운드 주체). Steps는 체크박스(`- [ ]`) 추적.

**Goal:** 기존 "배차현황"(`dispatch.board`)의 미배차 출고전표 목록을 **검수인 결재 완료(OUTBOUND_INSPECT) 건만** 보이도록 게이트하고, 목록에 **검수자/검수일시** 를 노출해 그 목록이 곧 "배차 발송 대기"가 되게 한다. 아로로지스 발송 흐름은 무변경 재사용.

**Architecture:** slip-service 미배차 조회(`GET /admin/dispatch-board/undispatched-slips`)의 쿼리에 검수 완료 조건(`status=COMPLETED AND inspectorUserId IS NOT NULL AND inspectorSignedAt IS NOT NULL`)을 추가하고 `SlipBoardResponse` 에 검수자명/검수일시 필드를 추가한다. clients/desktop 배차현황 미배차 목록에 해당 열 + mock 을 반영. arologis 발송(차량그룹 배정→dispatchToArologis)은 손대지 않는다.

**Tech Stack:** Spring Boot 3 / Java 17 / Spring Data JPA / PostgreSQL (slip-service); React + TypeScript + @samhan/design-system DataTable + react-query (clients/desktop). Testcontainers Postgres IT, vitest, Playwright real-qa.

## Global Constraints
- **Flyway 신규 마이그 없음(슬1)** — 기존 컬럼(`status`, `inspector_user_id`, `inspector_signed_at`, `dispatch_status`, `delivery_address`, `recipient_phone`) 재사용. `SlipDispatchStatus` enum 값 추가 금지([[feedback_enum_expansion_check_constraint]]).
- **page-code 재사용** — `dispatch.board` VIEW 가드 그대로. 신규 권한/시드 없음(슬1).
- **검수 완료 predicate** = `slipType=OUTBOUND AND status=COMPLETED AND inspectorUserId IS NOT NULL AND inspectorSignedAt IS NOT NULL AND dispatchStatus ∈ {UNDISPATCHED}(default) AND isDeleted=false`.
- **UUID 비노출**([[uuid-no-user-visibility]]) — 목록에 inspectorUserId(UUID) 금지, 검수자명(resolve)만. `id`(UUID)는 기존대로 client-side key 용만.
- **arologis 발송 흐름 무변경** — DispatchTask/차량그룹/`DispatchTaskCompletionService`/`ArologisDispatchClient` 미변경.
- **타배송사·external_carrier·SMS·인쇄 = 슬2~4 범위. 슬1에서 선구현 금지**(SlipBoardResponse 에 타배송사 필드 추가 금지).
- 실HTTP 계약([[restclient-contract-test-false-green]]) — 검수자명 resolve가 외부 user 서비스 호출이면 기존 슬립 목록의 name-resolve 패턴 재사용/계약 보존.
- 변경 모듈 전체 test 완주 후 push([[feedback_changed_module_full_test_before_push]]). CI 필터 allowlist 확인([[feedback_ci_test_filter_false_green]]) — `it.dispatch.*` 커버 여부.
- 한국어 커밋/PR(`[FEAT]`/`[FIX]` 대괄호 prefix), Role 풀네임. QA = Docker 라이브 + **과정 단계별 다수 스크린샷**(한 장 금지, [[feedback_canonical_workflow]] D7).

---

## File Structure (변경 대상)

**slip-service (BE)**
- Modify: `services/slip-service/.../repository/SlipRepository.java` — 검수 완료 게이트 쿼리 추가(JPQL `@Query` 또는 파생 메서드 확장).
- Modify: `services/slip-service/.../service/dispatch/DispatchTaskBoardQueryService.java` — 새 쿼리 사용 + 검수자명 batch resolve.
- Modify: `services/slip-service/.../dto/dispatch/SlipBoardResponse.java` — `inspectorName`, `inspectorSignedAt` 필드 추가.
- Modify: `services/slip-service/.../web/dispatch/DispatchBoardAdminController.java` — (resolve를 service에서 처리하면 무변경; map 위치만 조정 가능).
- Modify(Test): `services/slip-service/src/test/.../it/dispatch/DispatchBoardAdminControllerIT.java` — 검수 완료 게이트 IT 추가 + 기존 시드 갱신.

**clients/desktop (FE)**
- Modify: `clients/desktop/src/renderer/routes/dispatch-board/components/UnDispatchedSlipList.tsx` — 검수자/검수일시 열 추가.
- Modify: `clients/desktop/src/renderer/api/dispatchBoard.ts` — 응답 타입에 `inspectorName`, `inspectorSignedAt` 추가.
- Modify: `clients/desktop/src/renderer/api/mock.ts`(또는 dispatch mock 위치) — undispatched-slips mock 에 검수 필드 + 검수 완료 예시.
- Modify(Test): UnDispatchedSlipList 관련 vitest(존재 시) 또는 신규 최소 스펙.

---

## Task 1 — BE: 검수 완료 게이트 + 검수자/검수일시 노출

**Files:** SlipRepository.java(Modify) · DispatchTaskBoardQueryService.java(Modify) · SlipBoardResponse.java(Modify) · DispatchBoardAdminControllerIT.java(Test)

**Interfaces:**
- Produces: `SlipBoardResponse` record에 필드 추가 → `inspectorName: String`(검수자명, resolve, nullable graceful), `inspectorSignedAt: LocalDateTime`(검수일시). 기존 필드 순서/이름 보존(FE·기존 IT 영향 최소).
- Produces: 쿼리 결과 = 검수 완료 + 미발송 OUTBOUND 만.

- [ ] **Step 1: IT 실패 테스트 작성** — `DispatchBoardAdminControllerIT` 에 추가:
  - `GET_undispatched_slips_excludes_uninspected()`: OUTBOUND 슬립 2건 시드 — (A) status=COMPLETED + inspectorUserId/inspectorSignedAt 기록 + dispatchStatus=UNDISPATCHED, (B) status=PROCESSING(또는 INSPECTING, inspector null) + dispatchStatus=UNDISPATCHED. 응답에 **A만 포함, B 제외** 단언(`content.length==1`, `content[0].slipNo == A`).
  - `GET_undispatched_slips_exposes_inspector()`: A 응답에 `inspectorName`(검수자명 non-null), `inspectorSignedAt` non-null 단언. inspectorUserId(UUID) 미노출 단언(JSON 키 부재).
- [ ] **Step 2: 테스트 실패 확인** — `gradlew :slip-service:test --tests "*DispatchBoardAdminControllerIT*"` (로컬 Testcontainers skip 시 CI Linux 확인 의무 [[testcontainers-windows-docker]]). Expected: FAIL(게이트/필드 부재).
- [ ] **Step 3: 쿼리 게이트 구현** — `SlipRepository` 에 검수 완료 게이트 메서드 추가. JPQL 예시 형태(시그니처/조건 명세, Codex 구현):
  - `Page<Slip> findDispatchReadyOutboundSlips(LocalDate from, LocalDate to, Set<SlipDispatchStatus> statuses, Pageable pageable)` — WHERE `slipType=OUTBOUND AND status=COMPLETED AND inspectorUserId IS NOT NULL AND inspectorSignedAt IS NOT NULL AND dispatchStatus IN :statuses AND slipDate BETWEEN :from AND :to AND isDeleted=false`. 정렬은 기존(slipDate DESC, seqNo DESC) 유지.
  - `DispatchTaskBoardQueryService.findUnDispatchedSlips()` 가 새 메서드 호출하도록 교체(기존 `findAllBySlipType...` 호출 대체). 날짜/상태/페이지 가드 로직 유지.
- [ ] **Step 4: 검수자명 resolve + DTO 확장** — `SlipBoardResponse` 에 `inspectorName`, `inspectorSignedAt` 추가. 검수자명은 **기존 슬립 목록의 name-resolve 패턴 재사용**(owner/dispatcher 명 resolve와 동일 — `UserInternalClient` batch 또는 graceful per-row, 미해결 시 null/대시). resolve 위치 = `DispatchTaskBoardQueryService`(Page<Slip>→Page<SlipBoardResponse> 매핑 시 inspector 이름 주입). `SlipBoardResponse.from(slip)` 순수 매핑은 inspectorSignedAt까지만, 이름은 service에서 주입하는 오버로드/매핑으로 처리.
- [ ] **Step 5: 테스트 통과 확인** — Step 2 명령 재실행. Expected: PASS. 기존 `GET_undispatched_slips_with_custom_filters` 등 기존 테스트가 검수 완료 시드를 안 하면 깨질 수 있으므로 **기존 시드도 검수 완료로 갱신**(게이트 동작 변경 반영). 변경 모듈 전체 test 완주.
- [ ] **Step 6: 커밋** (Claude 대행) — `[FEAT] 배차 발송 대기: 미배차 목록 검수 완료 게이트 + 검수자/검수일시 노출 (슬1 BE)`

---

## Task 2 — FE: 배차현황 미배차 목록 검수자/검수일시 열 + mock

**Files:** dispatchBoard.ts(Modify) · UnDispatchedSlipList.tsx(Modify) · mock.ts(Modify) · vitest(Test)

**Interfaces:**
- Consumes: Task 1의 `SlipBoardResponse` (+`inspectorName`, `inspectorSignedAt`).

- [ ] **Step 1: 타입 확장** — `dispatchBoard.ts` 의 미배차 슬립 응답 타입에 `inspectorName: string | null`, `inspectorSignedAt: string | null` 추가.
- [ ] **Step 2: mock 갱신** — undispatched-slips mock 응답에 검수 필드 추가 + **검수 완료 예시만** 반환(검수 안 된 예시는 제외해 게이트 의미 반영). page.route no-op 원칙([[feedback_inprocess_mock_principles]]).
- [ ] **Step 3: 열 추가** — `UnDispatchedSlipList.tsx` DataTable 컬럼에 **검수자**(inspectorName, null→'—'), **검수일시**(inspectorSignedAt, KST 포맷, null→'—') 추가. 배송지(deliveryAddress)·수령자(recipientPhone)는 기존 노출 여부 확인 후 누락 시 동반 추가. design-system DataTable 패턴 유지.
- [ ] **Step 4: vitest** — UnDispatchedSlipList 렌더 스펙(존재 시 확장, 없으면 최소 신규): 검수자/검수일시 열 렌더 + null '—' 폴백 단언. `npm run typecheck`([[feedback_desktop_typecheck_command]]) + lint + vitest 통과.
- [ ] **Step 5: 커밋** (Claude 대행) — `[FEAT] 배차 발송 대기: 배차현황 미배차 목록 검수자/검수일시 열 + mock (슬1 FE)`

---

## QA (각 리뷰 라운드 Docker 라이브 + 과정 단계별 다수 스크린샷)
실 게이트웨이:8080 / 실 slip-service / 실 시드, mock OFF. **단계별 별도 캡처**:
1. 출고전표 상세 — 검수 결재 완료(검수자/검수일시 기록) 화면.
2. 배차현황 진입 — 미배차 목록에 그 전표가 **검수자/검수일시와 함께** 표시.
3. 검수 안 된 출고전표는 미배차 목록에 **미표시**(게이트 동작) — 비교 캡처.
4. 아로로지스 배차(차량그룹 배정 → 발송) 정상 동작(무회귀) 캡처.
각 캡처를 그 리뷰 라운드 PR 코멘트에 인라인. 가짜/합성 금지([[feedback_no_fake_data_ever]]). 실연동 불가 시 사유 정직 보고.

## Self-Review (spec 대조)
- spec §3 흐름(검수완료→발송대기) 슬1 = 게이트+노출로 커버. ✓
- spec §8 슬1 정의(발송대기 목록+arologis 연결) = 기존 배차현황 통합으로 충족(개발책임자 확정). ✓
- 비목표(타배송사/마스터/SMS/인쇄) 슬1 제외 명시. ✓
- placeholder: 검수자명 resolve는 "기존 패턴 재사용"으로 구체 지정(Codex가 기존 owner/dispatcher resolve 위치 확인). page-code/Flyway 신규 없음 — 확정. ✓
- 위험: 기존 IT 시드 갱신 필요(게이트 동작 변경) — Task1 Step5 명시. ✓
