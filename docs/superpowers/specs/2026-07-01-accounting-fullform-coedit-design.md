# 회계전표(Journal) full-form 라이브 coedit — 설계

> 2026-07-01 (집PC 재개 세션). 협업 full-form 5문서 롤아웃의 **회계(5번째)** 슬라이스.
> 상위 에픽: `2026-06-30-live-coediting-design.md` / 롤아웃: `2026-07-01-coedit-fullform-rollout.md`.
> 현황: slip·주문(#689)·견적(#691)·결재(#696) **4/6 완료** → 잔여 = 회계·배차.

## 0. 정찰 종합 (4방향, 2026-07-01)

| 레이어 | 상태 | 파일 |
|---|---|---|
| coedit relay (BE) | ✅ 완비 (byte-agnostic) | `JournalCollabController`(coedit/update/awareness/stream) + `CollabCoeditService` delegate + `JournalCoedit*` DTO |
| FE full-form 배선 | ❌ 미구현 | `JournalCollaborationPanel.tsx:298` — `CollaborativeTextField` memo 1필드만. `createDocCoeditProvider` 미사용 |
| 저장 PUT 경로 | ❌ **부재** | `JournalController` = POST create / GET / post / reverse 만. **PUT/PATCH/replaceLines 0건** |
| 원장필드 편집 | ❌ 400 차단 | `JournalDocumentCollaborationPort` `LEDGER_HEADER_FIELDS`/`LEDGER_LINE_FIELDS` 명시 거부 |

**핵심 판정**: 롤아웃 스펙 트랙B("기존 저장 PUT 재사용, BE 변경 0")는 주문·견적·결재엔 성립했으나 **회계는 그 전제(PUT)가 없다** → 회계는 유일하게 **BE PUT 신설 동반**. 핸드오프 "최대규모" 판정 TRUE.

## 1. 도메인 제약 (회계 고유 — 다른 4문서엔 없던 것)

- **POSTED 불변**: `Journal.java:49` "POSTED 이후 직접 수정 불가(audit safe)". 정정 = `reverse()` 후 신규 분개. → coedit/PUT 대상은 **DRAFT 한정**이 자연스러움.
- **차대변 균형**: 현재 `Journal.post()` 게시 시점에만 `totalDebit == totalCredit` 강제(`Journal.java:222`). create 시점 미검증. 라인 단위 `JournalLine.validateAmounts()`(한 쪽만 양수).
- **라인 가변**: `addLine`/`removeLine`(DRAFT만) 존재하나 외부 노출 경로 없음. `replaceLines` 부재.
- **revision 부재**: 회계엔 `*Revision*` 엔티티 없음(slip/partner/partner-order만 보유). 참고 모델 = `SlipUpdateService` + `SlipRevisionService.capture(EDIT)`.

## 2. 재사용 vs 신규 (정찰 확정)

**그대로 재사용 (변경 0):**
- BE relay: `CollabCoeditService` + `CollabCoreAutoConfiguration` + `JournalCollabController` coedit 4엔드포인트 + DTO — **모두 존재, 신규 불필요**
- FE 인프라: `createDocCoeditProvider`(Y.Map header + Y.Array<Y.Map> items), `CollaborativeSlipInput`(fieldPath header.X / items.{lineId}.cell), `coeditApi`, lineId add/remove/byId API(`addItem`/`removeItem`/`setItemValueById` — 코드·유닛검증 완료)

**신규 필요 (회계 고유):**
- **[슬1/BE]** `PUT /accounting/journals/{id}` DRAFT 수정 엔드포인트 = 헤더(journalDate/description) + 라인 `replaceLines`(accountCode/debit/credit/partnerName/memo) + 낙관락(@Version 409) + (선택) revision capture. **slip `SlipUpdateService` 패턴 이식.**
- **[슬2/FE]** 분개 full-form 배선 = `createDocCoeditProvider` 호출부 + 헤더/라인 셀 `CollaborativeSlipInput` 교체 + **가변 라인 add/remove(addItem/removeItem 첫 프로덕션 소비)** + 슬1 PUT 저장 소비 + status 게이트(DRAFT). 숫자 line.id → 비숫자 래핑(`jl-${id}`) 필수.

## 3. 슬라이스 분해

### 슬1 — BE: Journal DRAFT 수정(PUT) 엔드포인트 (본 PR, 순수 BE)
- `PUT /accounting/journals/{id}` — DRAFT 상태만 허용(POSTED/REVERSED → 409). 헤더 journalDate·description + 라인 전체 교체(replaceLines).
- 라인 교체: 기존 라인 clear + 신규 라인 add(도메인 `addLine` 재사용, `@Transactional`). 계정과목 유효성·`validateAmounts()` 재사용.
- 낙관락: `@Version` 기반 409 conflict(slip 동형). 요청 DTO에 expectedVersion/updatedAt.
- **균형**: DRAFT 저장 시 **불균형 허용**(작성 중) — 균형 강제는 게시(post) 시점 유지. FE 저장 게이트(isBalanced)는 별개 UX(→ D-ACC-02).
- revision capture: **본 슬라이스 범위 제외**(→ D-ACC-04, 회계 revision 엔티티 신설은 별건). 슬1은 PUT+coedit 최단 경로 우선.
- 검증: Testcontainers IT(DRAFT PUT 성공·POSTED 409·낙관락 충돌 409·라인 교체·균형 미강제) + fresh PG probe(Flyway 변경 시).

### 슬2 — FE: 분개 full-form coedit 배선 (슬1 머지 후)
- `createDocCoeditProvider({documentId: journalId, basePath: '/accounting/journals/{id}', headerTextFields: JOURNAL_HEADER_TEXT_FIELDS})`.
- 헤더: journalDate(LWW date), description(char-CRDT 후보). 라인: accountCode(Select→슬2는 평문 유지 가능, CollaborativeSlipInput은 Input 전용), debit/credit(number), partnerName, memo.
- **가변 라인 add/remove**: addItem/removeItem 배선(첫 프로덕션). 차대변 균형 실시간 표시.
- 저장: 슬1 PUT 소비. status 게이트 = DRAFT만 full-form 진입(POSTED/REVERSED 읽기전용).
- 기존 "협업 메모"(top-level Y.Text) 노드는 **별개 유지** — 묶지 말 것(rollout.md:20).
- 검증: **2세션 동시편집 라이브 QA**(두 창 헤더/라인 셀 동시 편집 반영·저장·add/remove).

## 4. 개발책임자 결정지점 (권장값 박제 — 오전 확정)

- **D-ACC-01 · coedit 스코프**: DRAFT 한정(POSTED/REVERSED 불변 유지). → **권장 A(DRAFT 한정)**. POSTED 편집은 audit-safe 원칙 위반.
- **D-ACC-02 · DRAFT 저장 균형**: 저장(PUT) 시 차대변 균형 강제 여부. → **권장 = 미강제**(작성 중 저장 허용, 균형은 게시 때). 단 현재 FE 저장 버튼은 isBalanced 요구 → 유지하되 PUT은 관대(임시저장 대비).
- **D-ACC-03 · 원장필드 라이브 동시편집**: accountCode/debit/credit을 여러 사용자가 동시편집 허용? (회계 무결성 vs 협업 편의). → **권장 A(DRAFT 한정 허용)** — DRAFT는 미게시라 무결성 위험 낮음, 5문서 full-form 일관성. ⚠️ **가장 민감한 결정** — 반대 시 원장필드 read-only + 적요/메모만 coedit로 축소 가능(단 이는 사실상 현행과 유사 → 에픽 취지 약화).
- **D-ACC-04 · revision 이력**: 회계 편집 revision 엔티티 도입 여부. → **권장 = 후속 별건**(슬1 제외). 감사 필요 시 slip 패턴 이식.
- **D-ACC-05 · 저장 충돌 정합**: 낙관락 ↔ 라이브 동시편집 영속 모델(마지막 저장자 승리 vs 병합). → rollout.md 이미 "후속·개발책임자 결정"으로 이연. **유지**.

## 5. 워크플로우 (불변 — [[feedback_canonical_workflow]])

Opus 기획+조기PR → Codex 개발 → **Opus 5-agent(FE/BE/Design/DevOps/QA)+Opus fix+TM게시 ↔ Codex 5-agent+Codex fix+TM게시** 0수렴 → PM 종합 게시 → CI green → PM 머지. 순차 듀얼·라운드 즉시 게시·라이브 실QA(2세션 동시편집)·단축금지. 스코프 임의축소·부분완료 종결선언 금지([[feedback_epic_scope_no_narrowing]]) — **5문서(회계·배차) full-form 충족까지 에픽 미완**.

## 6. 리스크

- **가변 라인 add/remove 첫 프로덕션 소비**: slA1 API(addItem/removeItem) 유닛검증만 됨, 라우트 페이지 실사용 0건. 회계가 최초 → 라이브 QA 필수, index seed-lock 대비 회귀 주의.
- **숫자 line.id 함정**: 서버 `JournalLine.id`(UUID)면 안전하나 정수면 `generateLineId` 오라우팅(순수숫자→index) → 비숫자 접두 래핑 강제.
- **POSTED 경합**: coedit 중 다른 사용자가 post() 하면? → status 게이트 + PUT 409(POSTED 거부)로 방어. 라이브 QA 시나리오 포함.
