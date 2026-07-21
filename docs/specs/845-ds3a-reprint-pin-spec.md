# #845 DS-3a — 결재 문서 재인쇄 "승인 당시 레이아웃" pin (OPUS 기획)

> 에픽: #845 문서 양식 디자이너 · 선행 DS-1(PR #846 렌더러 Foundation) · DS-2(V10 템플릿 관리) 완료
> 개발책임자 결정 근거: `.claude/memory/project_pending_decisions_2026_07_19.md:11` — "재인쇄 레이아웃 = 승인 당시 pin(⒜). 결재 완료 문서에 templateId+schema_version(또는 스냅샷) 각인 → 재인쇄 시 그 버전 렌더. 감사/법정 무결성"

---

## 0. 왜 지금인가 — 실코드로 확인한 결함

정찰에서 **pin 이 0% 구현**임을 파일 직독으로 확증했다(grep 0매치를 근거로 삼지 않음):

- `ApprovalLine`(결재 문서 엔티티)의 `@Column` 전수 = `id` / `content` / `template_id` / `field_values` / `version`.
  **`template_id` 는 입력 양식(`approval_templates`) 참조이지 문서 레이아웃(`document_templates`) 참조가 아니다.** 레이아웃 참조·스냅샷 컬럼 자체가 없다.
- 렌더 경로 `clients/desktop/src/renderer/print/ApprovalDocView.tsx:113-121` 는 **`docType → 현재 ACTIVE 템플릿`** 을 조회한다 (`DocumentTemplateService.findActiveByDocType`).

⟹ **관리자가 양식을 수정하거나 다른 템플릿을 ACTIVE 로 바꾸면, 이미 승인 완료된 과거 문서의 재인쇄 외형이 함께 바뀐다.** 승인된 문서의 외형 불변성이 깨지는 감사·법정 무결성 결함이며, 개발책임자가 pin 을 지시한 정확한 이유다.

---

## 1. 슬라이스 분할 — PM 기획 결정 (적대검증 1순위 대상)

개발책임자 결정문은 DS-3 에 **①재인쇄 pin** 과 **②편집기 MVP** 두 축을 담았다. PM 은 이를 **순차 2슬라이스로 분할**한다. **산출물 총량은 줄이지 않는다.**

| 슬라이스 | 범위 |
|---|---|
| **DS-3a (본 슬라이스)** | 재인쇄 승인시점 pin. groupware-service BE + 마이그레이션 + 렌더 경로 결선. FE 표면 최소 |
| **DS-3b (후속)** | 편집기 MVP — 3-pane · 밴드 캔버스 · `FIELD`/`TEXT`/`APPROVAL_GRID` · 저장 · 라이브 미리보기 + schema v2 |

**분할 근거**
1. 두 축은 기술적으로 독립이다(pin=BE/감사, 편집기=FE/스키마).
2. **순서 의존성이 실재한다** — pin 이 먼저 들어가야 편집기로 양식을 고쳐도 과거 승인 문서가 깨지지 않는다. 편집기를 먼저 넣으면 결함 노출면이 오히려 커진다.
3. 범위 동결 원칙([[feedback_throughput_parallel_scope_freeze_batch]]) — 한 슬라이스 라운드 비용이 약 3~4h 인데, BE+FE 를 합치면 매 라운드 양쪽 전면 재검증이 된다.
4. DS-3a 는 **BE 중심이라 병렬 진행 중인 트랙2(#825 슬5, desktop FE)와 간섭이 0 에 가깝다.**

> ⚠️ 이 분할은 개발책임자 결정의 *범위*가 아니라 *실행 순서*에 대한 PM 판단이다. 이견이 있으면 본 PR 에서 지적해 주시면 즉시 합친다.

---

## 2. 기획 결정

### D-DS3A-01 · pin 기전 = **revision 이력 테이블 + 참조 각인** (스냅샷 복제 아님)

결정문이 "templateId+schema_version **또는 스냅샷**" 으로 양자택일을 열어두었다. 정찰 실증에 근거해 아래를 채택한다.

| 대안 | 판단 |
|---|---|
| ⒜ 승인 문서에 `document` JSONB **전체 스냅샷** 각인 | 무결성은 확실하나, 문서 건수만큼 최대 64KB JSONB 를 복제 |
| **⒝ 템플릿 revision 이력 테이블 + `(templateId, revision)` 참조 각인** ✅ | 채택 |

**채택 근거**: 현행 `DocumentTemplate.updateDocument()` 는 **in-place 교체 + `revision++`** 이라 과거 revision 본문을 보존하지 않는다. 즉 **참조만 각인하면 pin 이 조용히 깨진다**(정찰이 실코드로 확인). ⚠️ 이 논거는 **'이력 없는 참조각인'을 배제하는 논거이지 스냅샷(⒜) 자체를 배제하는 논거가 아니다** — 스냅샷도 참조각인과 마찬가지로 이력 없이 pin이 깨지는 문제와 무관하다(FABLE5 R1 M-3 지적). 이력을 남기면 참조 각인으로 무결성이 충족되고, 문서마다 본문을 복제하지 않아도 되며, 템플릿이 soft-delete 되어도 이력 행이 살아 있어 재인쇄가 가능하다.

**불변식**: 이력 행은 **append-only — 수정·삭제 금지.** 회계 원장 수정금지 정신을 그대로 적용한다([[project_accounting_ledger_edit_policy]]).

> 🚨 **FABLE5 R1 재검토 — 결론(이력 테이블 채택)은 유지, 단 근거를 교체한다.**
> 기획 리뷰 단계에서 두 대안을 저장 **비용**(⒜ 전량 스냅샷 복제 vs ⒝ revision당 1회 저장)으로 저울질했으나, 실측 결과(dev-report §2) 승인 20건 × 321 bytes = 전량 스냅샷을 택해도 총 ~6.4KB에 불과해 **이 축은 양방향 모두 무시할 만한 규모라 근거로 성립하지 않는다.** 저장비용이 아닌 아래 5가지가 진짜 근거다.
> 1. `approval_lines` — 결재 문서 자체를 담는 **핵심 감사 테이블** — 를 JSONB 스냅샷 컬럼 없이 슬림하게 유지한다.
> 2. **DS-3b(#868) 편집기가 이력·롤백·과거 revision 브라우징 기능을 요구**한다 — 스냅샷 각인 방식으로는 "그 템플릿이 어떻게 변해왔는가"를 결재 문서 쪽에서 역추적할 수 없다.
> 3. 템플릿 변경 이력 자체가 결재 pin 과 무관하게 **독립적인 감사 가치**를 가진다(누가 언제 양식을 어떻게 바꿨는지).
> 4. `(template_id, revision)` **복합 FK** 로 dangling pin(존재하지 않는 revision을 가리키는 pin)을 DB 레벨에서 원천 차단한다 — 스냅샷 방식은 무결성 검증이 불가능한 opaque blob이라 이 방어가 성립하지 않는다.
> 5. pin 각인 시점에 `ensureCurrentRevision` 이 **self-heal**한다(이력이 없으면 그 자리에서 만든다) — 스냅샷 방식엔 이런 지연 보정 여지가 없다.

### D-DS3A-02 · pin 발효 시점 = **최종 승인 완료(APPROVED 전이) 시점**

- "승인 당시" 문언에 가장 충실하다. 상신(SENT) 시점 pin 은 결재 도중의 양식 개선이 반영되지 못한다.
- **반려 → 재상신 → 재승인 시에는 재-pin** 한다(그때가 새로운 "승인 당시").
- DRAFT·진행중 문서는 pin 없음 → 현재 ACTIVE 로 렌더한다(아직 확정 문서가 아니므로 최신이 맞다).

### D-DS3A-03 · backfill = **소급 각인 금지. 승인 시점 ACTIVE-0은 DEFAULT 사용 사실을 각인**

과거 승인 문서에는 pin 정보가 없다. **"그때 무엇이 ACTIVE 였는지" 를 알 수 있는 근거가 시스템에 없으므로 소급 각인은 위조다** ([[feedback_no_fake_data_ever]]).

- 기존 승인 문서처럼 `document_template_default_pinned=false`인 NULL은 정직하게 미pin으로 두고 현재 ACTIVE로 렌더한다.
- 승인 시점 ACTIVE-0으로 `document_template_default_pinned=true`인 NULL은 현재 ACTIVE를 조회하지 않고 내장 `GROUPWARE_DEFAULT`로 렌더한다.
- 단, 재인쇄 화면에 **"승인 당시 레이아웃 정보가 없어 현재 양식으로 표시됩니다"** 고지를 노출한다(운영자가 외형 차이를 오해하지 않도록). 이 고지는 **docType 이 있는 문서에만** 적용한다 — docType 자체가 없는 구식/독립형 결재는 "레이아웃 pin" 개념이 성립하지 않으므로 고지 대상이 아니다(FABLE5 R1 LOW 정정 — 최초 구현은 이 구분이 없어 docType=null 문서에도 부정확한 고지가 노출됐다).
- 대상 건수는 구현 시 **실 DB 실측**해 dev-report 에 기록한다(추정 금지).

> **결정 철회 — ACTIVE-0도 승인 시점에 DEFAULT 사용 사실을 영구 각인한다(개발책임자 결정, 2026-07-21)**
> `pinApprovedLayout()` 이 최종 승인 시점에 그 docType의 ACTIVE 문서 양식을 찾지 못하면, `document_template_default_pinned=true`를 기록하고 template/revision pin은 NULL로 유지한다. 이후 새 양식이 ACTIVE가 되어도 이 표식은 내장 `GROUPWARE_DEFAULT` 렌더로 고정된다. 이는 승인 순간 ACTIVE가 없었다는 시스템 관측 사실의 기록이며 소급 추정이 아니다. 반대로 이미 승인된 과거 문서에 당시 ACTIVE 양식을 추정해 채우는 소급 각인은 계속 금지한다. 기존 R1의 ACTIVE-0 영구 무pin 수용 결정은 철회한다.

### D-DS3A-04 · 스키마 버전 변경 없음 — v1 유지

`FIELD`/`TEXT` 요소, `geometry{x,y,w,h}`/`style{}`/`binding` 은 현 스키마(7종 화이트리스트)에 없고 **schema v2 + upcaster 가 필요하지만 그것은 DS-3b 범위**다. DS-3a 는 기존 v1 문서를 그대로 pin·렌더한다.

### D-DS3A-05 · 권한 = 기존 page-code 재사용, 신규 seed 0

- 관리자 문서 양식 CRUD(`/admin/groupware/document-templates/**`): 기존 `groupware.approval-templates` (DFD-07 결정 준수)
- **재인쇄용 pin revision 단건 조회(`/groupware/document-templates/{templateId}/revisions/{revision}`): 인증-only, page-code 검사 없음.** 재인쇄 주체는 그 결재 문서를 볼 수 있는 사람(`groupware.approvals` view 보유자)이지 문서 양식을 관리하는 사람(`groupware.approval-templates`)이 아니므로, 별도 page-code 를 새로 만들지 않고 인증 여부만 확인한다.
  > 🚨 **FABLE5 R1 M-5 정정**: 최초 spec 은 이 줄을 "기존 `groupware.approval-templates` 재사용"으로 잘못 적어 §3 산출물의 "이력 단건 조회 API(인증-only, 재인쇄 전용)"와 상충했다. **구현이 인증-only 를 채택했고 그것이 옳다** — 위 논거대로 spec 을 구현에 맞춰 정정한다.
- 재인쇄 조회(결재 문서 자체): 기존 `groupware.approvals` view
- **auth-service 마이그레이션·권한 seed 신규 0건.**

### D-DS3A-06 · 렌더 우선순위 + 조회 실패 고지

`pin 있음 → 각인된 revision` → `pin 없음 → 현재 ACTIVE` → `조회 실패/malformed → DEFAULT`.
마지막 DEFAULT 수렴은 DS-2 R2 가 넣은 현행 latch(`ApprovalDocView.tsx:122-148`)를 **그대로 유지**한다.

> 🚨 **FABLE5 R1 H-2 정정 — 이 결정에 "고지" 축이 누락돼 있었다.** 원문은 미pin(D-DS3A-03) 에는 화면 고지를 요구하면서, **pin 은 있는데 그 revision 조회 자체가 실패/malformed 인 경우에는 고지를 정의하지 않았다.** 최초 구현이 이 spec 을 그대로 따른 결과, `retry:false` 설정과 맞물려 일시 5xx 한 번에도 **아무 고지 없이** DEFAULT(제3의 외형)로 조용히 인쇄되는 결함이 발생했다 — 감사·법정 문서가 승인 당시 양식도 현재 양식도 아닌 외형으로 무고지 출력되는 것이라 원 결함(관리자가 양식을 바꾸면 재인쇄가 조용히 바뀜)보다 오히려 퇴행 가능한 경로였다. 이건 구현 결함이 아니라 **이 spec 의 기획 공백이 근본 원인**이다.
>
> **정정된 결정**: pin 이 있는데 revision 조회가 실패(네트워크/5xx)하거나 malformed(파싱 실패) 인 경우에도 **반드시 화면에 실패를 드러낸다** — `role="alert"` 고지 + 재시도 경로(사용자가 다시 조회를 트리거할 수 있어야 한다). 무고지 DEFAULT 강하는 금지. 미pin 고지(`role="status"`, 정보성)와 pin-조회-실패 고지(`role="alert"`, 오류성)는 서로 다른 배너로 구분한다(전자는 `!hasPinnedLayout`, 후자는 `hasPinnedLayout && 조회실패` 로 상호 배타적).

---

## 3. 산출물

### BE (groupware-service)
- **마이그레이션 `V12__*.sql`** (현 최신 = V11 `widen_document_type_columns`, #848)
  - `document_template_revisions` 신설 — `template_id`, `revision`, `schema_version`, `document` JSONB, 감사 컬럼, `unique(template_id, revision)`
  - 기존 `document_templates` 각 행의 **현재 상태를 이력 1건으로 backfill**(현 revision 번호 그대로)
  - 결재 문서 테이블에 `document_template_id UUID NULL` · `document_template_revision INT NULL` 추가
    - 승인 시점 ACTIVE-0 구분용 `document_template_default_pinned BOOLEAN NOT NULL DEFAULT FALSE` 추가
    > ⚠️ 실제 테이블명·엔티티 매핑은 구현이 `ApprovalLine` 매핑으로 **직접 확인**할 것. 본 spec 의 테이블명은 추정이며 근거로 쓰지 말 것.
- `DocumentTemplateRevision` 엔티티 — append-only(수정·삭제 경로 미제공)
- `DocumentTemplateService.updateDocument()`·`activate()` 가 이력을 **append** 하도록 결선
- 승인 완료 전이 지점에서 pin 각인 (tx 경계 주의 — 승인 전이와 동일 tx)
- 이력 단건 조회 API (인증-only, 재인쇄 전용)

### FE (clients/desktop, 최소 표면)
- `ApprovalDocView` 가 pin 존재 시 각인된 revision 을 조회하도록 분기 + **미pin 고지 배너**
- `api/documentTemplate.ts` 에 이력 조회 추가
- `api/mock.ts` 대응 핸들러
  > ⚠️ 트랙2(#825 슬5)가 `mock.ts` 를 점유 중이다. 접촉 구간은 `:10253`(document-templates active 핸들러) / `:15136`(`MOCK_DOCUMENT_TEMPLATES` 시드) 인근으로, 트랙2 hunk(`6176/6202/8944/12448/16711`)와 1,500줄 이상 이격되어 텍스트 충돌 확률은 사실상 0. **그래도 구현은 해당 구간만 최소 수정할 것.**

### 테스트
- **IT**: pin 각인 · 재인쇄 불변 · 이력 append-only · 반려→재상신→재승인 재-pin · 미pin fallback
- FE vitest + Playwright 재인쇄 pin 시나리오
- 마이그레이션 fresh Postgres probe ([[feedback_migration_fresh_postgres_probe]] — Windows skip 이 가리므로 DROP/CREATE + `psql ON_ERROR_STOP`)

---

## 4. 불변식 / anti-false-green

1. 🚨 **핵심 회귀**: *승인 완료 → 템플릿 수정 → 재인쇄* 시 **수정 전 외형**이 나와야 한다.
   이 테스트는 **pin 로직을 제거하면 반드시 RED** 여야 한다. 이중 방어로 인해 한쪽만 지워도 green 이면 false-green 이므로, **실제로 뮤테이션해 RED 를 실측**할 것 ([[feedback_react_query_freshness_route_param_reset]] 의 "고유 구별출력 단언" 원칙 — presence-only 단언 금지). 🚨 **FABLE5 R1 M-1 추가**: 이 불변식은 Playwright mock 게이트에서도 **실제로 실행**돼야 한다 — mock 결재 픽스처에 pin 참조(`documentTemplateId`/`documentTemplateRevision`)가 있는 시드가 최소 1건 있어야 하며, 없으면 이 회귀는 mock 게이트에서 dead code(무회귀 신호)가 된다.
2. 이력 append-only — UPDATE/DELETE 시도가 실제로 차단되는지 IT.
3. **DS-1 strangler 불변식 유지** — `PrintLayout` 무변경, 골든 **18** HTML 회귀 통과(🚨 FABLE5 R1 정정 — 최초 spec 은 정찰 보고 "골든 17" 을 검증 없이 인용했으나 `clients/desktop/src/renderer/print/__goldens__/*.html` 실측은 18개다).
4. Playwright mock 게이트 **전량 green**(구현자 본인 전량 실행 + 스크린샷 부수효과 원복 2경로: `docs/qa/**` · `clients/desktop/playwright/**/screenshots/**`). 최초 구현 시점 총 590개였으나, FABLE5 R1 M-1 로 pin 시나리오(`ac-845-ds3a-reprint-pin`) 4건이 추가돼 총 개수가 늘어난다 — **고정된 590 이라는 숫자 자체가 아니라 "그 라운드에 실행된 전량이 green" 이 불변식**이다.
5. 🚨 **FABLE5 R1 H-1/H-2 추가 — 재인쇄 고지 배너 2종의 불변식**:
   - 두 배너(미pin `role="status"` · pin 조회 실패 `role="alert"`) 는 **인쇄 출력에 포함되지 않는다**(`no-print`, print 매체 emulate 로 실측). DS-1 strangler 불변식(인쇄 외형 무변경)의 연장.
   - 두 배너는 실제 정의된 CSS(AA 대비 4.5:1 이상, 실 토큰값 기준 계산)를 가진다 — 무스타일 원시 텍스트 금지.
   - pin 이 있는데 revision 조회가 실패/malformed 인 경우 **무고지로 DEFAULT 에 강하하지 않는다**(D-DS3A-06).

---

## 5. 기존 결정 교차검증 ([[feedback_spec_cross_check_prior_decisions]])

| 기존 결정 | 본 spec 정합 |
|---|---|
| DFD-07 권한 = `groupware.approval-templates` 재사용 | ✓ 신규 page-code·seed 0 |
| 회계 원장 수정금지(역분개 원칙) | ✓ 이력 append-only 로 반영 |
| 가짜 데이터 영구 배제 | ✓ backfill 소급 각인 배제, 실측 후 기록 |
| #848 `documentType` 40→70 (groupware V11) | ✓ 다음 번호 V12 사용 |
| DS-2 "관리 UI·편집기는 DS-3 범위" | ✓ 편집기는 DS-3b 로 분리(범위 유지) |
| DS-1 출력 무변경 strangler | ✓ `PrintLayout` 무변경 유지 |

---

## 6. 열린 위험

- 결재 문서 테이블은 **핵심 감사 테이블**이다. 컬럼 추가 마이그레이션은 fresh Postgres probe 필수.
- pin 각인 지점이 승인 전이 로직 내부라 **tx 경계**를 잘못 잡으면 승인은 되고 pin 은 누락되는 부분 실패가 가능하다(#854 에서 동형 결함을 이미 겪었다 — self-invocation `@Transactional` 우회).
- 이력 backfill 시 기존 `document_templates` 행 수를 실측할 것.
- 🚨 **FABLE5 R1 LOW — 마운트 중 승인 전이 edge(수용, 후속 미분리)**: `ApprovalDocView` 의 layout 결정은 컴포넌트 mount 시 **1회 latch**된다(`layoutDecided`). 재인쇄 화면이 이미 열려 있는 상태에서 그 사이 다른 사용자가 최종 승인을 완료해(→ pin 이 새로 각인됨) `approval` 쿼리가 백그라운드로 새 데이터를 받아오더라도, 이미 결정된 layout 은 재평가되지 않는다(단, 배너 노출 여부는 `approval` 최신 데이터로 매 렌더 재계산되므로 텍스트 고지 자체는 갱신될 수 있다). 실제 저장된 pin 값은 정확하며, 화면을 새로고침/재진입하면 새 mount 가 다시 latch 해 정확히 반영된다 — **깨지는 것은 이미 열려 있던 tab 의 표시뿐, 영속 데이터가 아니다.** 발생 조건이 좁고(재인쇄 화면을 미리 열어둔 채 최종 승인이 그 사이 완료돼야 함) 완화책(재진입)이 이미 존재하므로, 이번 슬라이스에서는 **현행 latch 설계를 그대로 수용**하고 별도 fix/후속 이슈로 분리하지 않는다.

## 7. 범위 밖 (명시적 제외)

- 편집기 MVP · schema v2 · upcaster → **DS-3b**
- If-Match/ETag 낙관락 DTO 노출 → DS-3b (DS-2 보고서가 "DS-3 후속" 으로 명시)
- 반복 detail 밴드 · 이미지/로고 · 인쇄 fidelity 반복 → **DS-4**
- DS-1 잔여 test-debt 2건(`build:print-renderer` CI 미검증 · frozen hash 가드 부재) → 별건 chore
