# 거래처(Partner) RESTORE 버전이력 + 복원 (Phase 2.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Codex 다운(6/1) 동안 Claude 에이전트** 구현+리뷰([[feedback_early_pr_docker_qa_screenshots]]). slip(2.1)/estimate(2.2) RESTORE 의 동형이나 **거래처 4탭 자식이 service-layer repository join**(@OneToMany 아님)이라 toSnapshot/restore 가 service 계층.

**Goal:** 거래처 마스터(헤더 + 4탭 자식: priceDiscount/shippingAddresses/contacts)를 revision별 full-snapshot(JSONB)으로 보관, TERMINATED 외 상태에서 point-in-time 복원.

**Architecture:** 신규 `partner_revisions`(JSONB) + `PartnerRevisionService`(service-layer capture/restore/list/summarize — Partner+3 repo 조립/복원). slip/estimate 패턴(D-RST-01~05) + Partner4TabService.updateFull 전량교체 재사용. spec: `docs/superpowers/specs/2026-05-29-partner-restore-version-history-design.md`.

**Tech:** Spring Boot 3 / JPA / PostgreSQL JSONB(@JdbcTypeCode SqlTypes.JSON — partner-service 첫 도입) / Flyway V12 / Testcontainers / React. 브랜치 `feat/phase-2-3-partner-restore`. 검증 `$env:GRADLE_USER_HOME='...codex-home'` + `--no-daemon --no-parallel`. 실 IT 는 Linux CI.

**참조 템플릿(estimate 2.2, 머지됨 — 미러)**: `slip-service/.../slip/estimate/revision/{domain,repository,service,web}` 전체 + `EstimateRevisionRestoreIT` + FE `EstimateVersionHistoryPanel.tsx`/`estimateRevision.ts`. (estimate=slip 동형, partner=estimate + service-layer 자식.)

**partner 대응(grounding)**: `partner.domain.{Partner(~40필드, @Version 없음), PartnerPriceDiscount(1:1 @Version), PartnerShippingAddress(1:N), PartnerContact(1:N), PartnerStatus{ACTIVE,SUSPENDED,TERMINATED}}`. `PartnerService.updateProfile(code, req, actorId, actorName)`, `Partner4TabService.updateFull(code, req, ...)`(자식 softDeleteAll+재등록, priceDiscount UPSERT). repo: PartnerRepository/PartnerPriceDiscountRepository/PartnerShippingAddressRepository/PartnerContactRepository. `Partner4TabController`(`/api/v1/partners`), `PartnerFullResponse`/`PartnerFullRequest`. partner SSE: PartnerAuditLogService broker `partner:edit`. Flyway V11→V12.

---

## Task 1: partner_revisions 데이터 계층
**Files:** `V12__add_partner_revisions.sql`, `partner/revision/domain/{PartnerSnapshot,PartnerRevision,PartnerRevisionType}.java`, `partner/revision/repository/PartnerRevisionRepository.java`, test `PartnerRevisionSnapshotTest`.
- [ ] V12 — estimate V28 동형, 테이블 `partner_revisions`(partner_id/revision_no/revision_type/source_revision_no/partner_code VARCHAR/snapshot JSONB/actor_*/BaseEntity7), partial unique `(partner_id,revision_no) WHERE is_deleted=false` + 인덱스.
- [ ] `PartnerSnapshot` record: 헤더 ~40필드(Partner 실 필드 확인) + `PriceDiscount`(nullable record) + `List<ShippingAddress>` + `List<Contact>`(각 자식 실 필드 확인). @JsonInclude(NON_NULL).
- [ ] `PartnerRevisionType`(CREATE/EDIT/RESTORE) + `PartnerRevision`(@Entity @Table("partner_revisions") extends BaseEntity, @JdbcTypeCode JSON snapshot, factory of(...), getters). EstimateRevision 미러(estimateId→partnerId, estimateNo→partnerCode).
- [ ] `PartnerRevisionRepository`(findByPartnerIdOrderByRevisionNoDesc/findByPartnerIdAndRevisionNo/`@Query maxRevisionNo`).
- [ ] 단위(factory+Jackson round-trip 헤더+3자식). `:services:partner-service:compileJava :compileTestJava :test --tests *PartnerRevisionSnapshotTest*` GREEN. commit `feat(partner-restore): partner_revisions 데이터 계층 (V12)`.

## Task 2: 캡처 (PartnerRevisionService.capture + toSnapshot 조립 + 훅)
**Files:** `partner/revision/service/PartnerRevisionService.java`, modify `PartnerService.java`(updateProfile 훅), `Partner4TabService.java`(updateFull 훅, create 경로), test.
- [ ] `PartnerRevisionService`(@Service @Transactional): `PartnerSnapshot assemble(UUID partnerId)`(Partner + 3 repo 조회 → snapshot 조립) + `capture(Partner, PartnerSnapshot, type, sourceRev, actorId, actorName, actorColor)`(maxRevisionNo+1 saveAndFlush + DataIntegrityViolation 1회 재시도→CONFLICT 409) + `list`. EstimateRevisionService 미러 + assemble 추가.
- [ ] `PartnerService.updateProfile` 성공 후 capture(EDIT). `Partner4TabService.updateFull` 성공 후 capture(EDIT). 거래처 생성 경로 capture(CREATE). **편집 경로 전수 확인**(D-RST-03). actor: updateProfile 은 actorId/actorName 보유, updateFull 은 Principal → service 에 actor 인자 전달 보강.
- [ ] 단위(capture 채번 1,2 + assemble 헤더+3자식 정합 + race 2케이스). GREEN. commit `feat(partner-restore): 스냅샷 캡처 (assemble + capture + 훅)`.

## Task 3: 복원 (PartnerRevisionService.restore + 편집가능 가드)
**Files:** modify `PartnerRevisionService.java`(restore), `PartnerService.java` 또는 신규 `restoreToRevision`, `Partner.java`(isEditable), test.
- [ ] `Partner.isEditable()` 신규(status != TERMINATED) + `requireEditable()`(아니면 BusinessException CONFLICT).
- [ ] `PartnerRevisionService.restore(partnerCode/partnerId, targetRevNo, actor)`: target 404 → partner 로드 → **requireEditable**(TERMINATED 거부) → snapshot 적용(헤더 도메인 update 메서드 + 자식 전량교체: Partner4TabService 의 softDeleteAll+재등록/priceDiscount UPSERT 로직 재사용 — 공통 helper 추출 또는 호출) → capture(RESTORE, source). → `PartnerFullResponse` 반환.
- [ ] 단위/IT: 복원 헤더+자식, 자식 add/remove, TERMINATED→CONFLICT, RESTORE revision source. GREEN. commit `feat(partner-restore): point-in-time 복원 (TERMINATED 가드)`.

## Task 4: REST API
**Files:** `partner/revision/web/PartnerRevisionController.java`, `dto/PartnerRevisionResponse.java`, `PartnerRevisionService.summarize/listWithSummary`.
- [ ] `PartnerRevisionResponse`(revisionNo/revisionType/sourceRevisionNo/partnerCode/actorName/createdAt/changeSummary{headerChanged,childAdded,childRemoved,childModified}). actorId 미노출. + `summarize`(헤더 필드 비교 + 자식 식별자 기준 add/remove/modify) + `listWithSummary`.
- [ ] `PartnerRevisionController`(`@RequestMapping("/api/v1/partners/{partnerCode}")`): GET `/revisions`(partners.4tab.edit VIEW) + POST `/revisions/{revisionNo}/restore`(partners.4tab.edit RESTORE, X-User-Id/X-User-Name). compile + commit `feat(partner-restore): REST API + changeSummary`.

## Task 5: BE 통합 테스트
**Files:** `partner/.../it/PartnerRevisionRestoreIT.java`.
- [ ] EstimateRevisionRestoreIT 미러 + partner: create/updateFull 캡처→타임라인(actorId 미노출), 복원(헤더+4탭 자식 회귀), 자식 add/remove 복원, **TERMINATED 복원 409**, RESTORE deny(check estimates… → partners.4tab.edit)+MASTER bypass. partner AbstractPostgresIT 에 DynamicPermissionClient @MockBean 없으면 IT 에 추가. compileTestJava 검증(실IT CI). commit `test(partner-restore): Testcontainers IT`.

## Task 6: FE
**Files:** `api/partnerRevision.ts`, `components/audit/PartnerVersionHistoryPanel.tsx`, modify `routes/admin/PartnerDetailDialog.tsx`.
- [ ] `partnerRevision.ts`(listRevisions/restoreRevision, `/api/v1/partners/{code}/revisions`). EstimateVersionHistoryPanel 미러 → `PartnerVersionHistoryPanel`(props {partnerCode, status}, react-query ['partnerRevisions',code], 복원 confirm+invalidate ['partner-full',code]+revisions, **status===TERMINATED 면 복원버튼 비활성+안내**, UUID 비노출). PartnerDetailDialog 에 "버전이력" 탭/패널 추가. typecheck PASS. commit `feat(partner-restore): FE 버전이력 패널 + 복원`.

## Task 7: Playwright + Docker QA 스크린샷 + 문서
**Files:** `playwright/.../partner-version-history.spec.ts`, `docs/dev-reports/phase-2-3-partner-restore-version-history.md`, `migration/decisions/DECISIONS.md`(D-RST-06), `docs/qa/phase-2-3-partner-restore/*.png`(스크린샷), overview.
- [ ] Playwright(mock /revisions+restore → 패널+복원+TERMINATED 비활성).
- [ ] **Docker 실 QA + 스크린샷**([[feedback_early_pr_docker_qa_screenshots]]): `.\scripts\launch-local-stack.ps1` 기동 → desktop 앱(또는 Playwright electron/gstack)으로 거래처 목록→상세→4탭 편집→버전이력→복원 confirm→결과 **단계별 촬영** → `docs/qa/phase-2-3-partner-restore/*.png`. PR 본문 인라인(잘 보이게).
- [ ] dev-report + DECISIONS D-RST-06(partner=4번째, service-layer 자식 조립, partners.4tab.edit RESTORE, TERMINATED 가드 신설, partner-service 첫 JSONB, shared 추출 인프라성만 후보 평가) + overview. commit `test(partner-restore): Playwright + Docker QA 스크린샷 + docs`.

---

## Self-Review (spec 대조)
spec §2→T1 / §3→T2 / §4→T3 / §5→T3·4 / §6→T4·6 / §7→T5·7(+Docker QA) / §8·9 범위·shared → plan 전반. placeholder: Partner/자식 실 필드는 T1~3 파일 확인. type 일관: assemble/capture/restore/summarize 시그니처 일치(estimate 미러 + service-layer assemble).

## Execution
Claude 에이전트 subagent-driven, Task 단위 PM 검증. **조기 PR(본 단계 생성)** 에 커밋 누적 → 구현 → Docker QA 스크린샷 → TM 종합 → dual 리뷰(Claude) → CI → 머지.
