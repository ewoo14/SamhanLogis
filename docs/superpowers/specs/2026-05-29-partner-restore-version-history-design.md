# 설계 — 거래처(Partner) 마스터 RESTORE 버전이력 + point-in-time 복원 (Phase 2.3)

> RESTORE 도메인 확장 4번째 적용(slip 2.1 / estimate 2.2 / inventory 보류 D-RST-04 / **partner 본 슬라이스**). slip·estimate 패턴(D-RST-01~05) 이식. 4번째 도메인 → slip+estimate+partner 공통부 **shared 추출 재평가** 시점.
> 브레인스토밍 grounding 완료: 2026-05-29. 표준 프로세스 갱신 적용([[feedback_early_pr_docker_qa_screenshots]]): 조기 PR + Docker 실 QA 스크린샷 + Claude 전면 대체 + TM 종합.

## 1. 목적 / 배경

거래처 마스터는 생성 후 다중 경로로 편집되는 마스터 데이터(헤더 + 4탭 자식). "누가 언제 거래처 정보를 바꿨고 특정 시점으로 되돌리기"의 가치가 명확. slip/estimate full-snapshot+point-in-time RESTORE 를 거래처에 적용.

### grounding 확정 사실 (slip/estimate 대비 차이)
- 위치: **partner-service** `com.samhanair.logis.partner.*`.
- **Partner 헤더**(~40필드, **@Version 없음**, BaseEntity soft-delete, 식별자 `partnerCode`) + 자식 3종: `PartnerPriceDiscount`(1:1, @Version), `PartnerShippingAddress`(1:N), `PartnerContact`(1:N). **자식은 JPA @OneToMany 아님 — partnerId UUID 로 별도 repository join** → snapshot 조립/복원은 **service 계층** 책임(도메인 메서드 불가).
- 편집 경로 2개: `PartnerService.updateProfile(partnerCode, req, actorId, actorName)`(헤더, X-User-Id/Name + 기존 audit overlay 기록 중) + `Partner4TabService.updateFull(partnerCode, req, ...)`(4탭 일괄, **자식 전량교체** softDeleteAll+재등록 + priceDiscount UPSERT — P06ValidationIT 검증). **편집 가능 상태 가드 없음**(status 무검사).
- `PartnerStatus`{ACTIVE, SUSPENDED, TERMINATED}. `PartnerLockPolicies.PARTNER`(terminal=TERMINATED) 선언만 존재(편집 미연동).
- 기존 `partner_audit_logs`(PR-H4b, **필드 diff overlay** + SSE `partner:edit`, PartnerAuditLogService) — full-snapshot 아님 → **신규 `partner_revisions`(JSONB) 별도 필요**.
- Flyway partner-service 최신 **V11 → 다음 V12**. **partner-service JSONB 선례 0**(slip `EstimateRevision`/`@JdbcTypeCode(SqlTypes.JSON)` 패턴 첫 도입).
- partner SSE 있음(`PartnerRealtimeController` + broker `partner:edit`). 복원 시 재사용.
- 권한 page: `partners.4tab.edit`(CREATE/UPDATE/DELETE), `partners.edit`, `partners.detail`. `PermissionAction.RESTORE` 존재. **PARTNER self-service carve-out 무관**(거래처 마스터 = 내부 admin, MASTER/MANAGER/SALES + @hr.isExecutiveOffice).
- FE: `api/partnerApi.ts`, `routes/admin/PartnerDetailDialog.tsx`(상세/4탭).

## 2. 데이터 모델

신규 `partner_revisions` (partner-service, Flyway **V12**): estimate_revisions(V28) 미러.

| 컬럼 | 설명 |
|---|---|
| `id` UUID PK · `partner_id` UUID(FK 미강제) · `revision_no` INT · `revision_type` VARCHAR(16)(CREATE/EDIT/RESTORE) · `source_revision_no` INT NULL · `partner_code` VARCHAR(식별자) · `snapshot` JSONB · `actor_id`/`actor_name`/`actor_color` · BaseEntity audit 7 |

- partial unique `(partner_id, revision_no) WHERE is_deleted=FALSE` + `(partner_id, revision_no DESC)` 인덱스. `@JdbcTypeCode(SqlTypes.JSON)`.
- `PartnerSnapshot` record(service 계층 조립): 헤더 ~40필드 + `PriceDiscount`(1건, nullable) + `List<ShippingAddress>` + `List<Contact>`. (estimate 의 `List<Line>` → 거래처는 3종 자식.)

## 3. 캡처 흐름

`PartnerRevisionService.capture(partner, snapshot, type, sourceRev, actor)` (service 계층 — Partner + 3 repository 조회 후 PartnerSnapshot 조립):
- `PartnerService.updateProfile`(헤더 EDIT) + `Partner4TabService.updateFull`(4탭 EDIT) + 거래처 생성(CREATE) 훅. **편집 경로 전수**(D-RST-03 누락 0). status 전이(suspend/activate/terminate)는 content 아님 → 캡처 제외(헤더 status 필드 변경은 capture 헤더에 포함되나 전이 메서드 자체는 별도 — content 편집 경로만 훅).
- 채번 maxRevisionNo+1 saveAndFlush + DataIntegrityViolation 1회 재시도 → CONFLICT 409(estimate 동형). actor X-User-Id/Name(4탭은 Principal → service 까지 actor 전달 보강 필요). UUID 비공개.

## 4. 복원(RESTORE) 흐름

`POST /api/v1/partners/{partnerCode}/revisions/{revisionNo}/restore`, `@RequirePermission(page="partners.4tab.edit", action=RESTORE)`:
1. partner + 대상 revision 스냅샷 로드(없으면 404).
2. **편집 가능 가드(신규)**: `Partner.isEditable()`(또는 service 가드) — **TERMINATED 거부**(409 CONFLICT), ACTIVE/SUSPENDED 허용. (slip 마감/estimate requireEditable 사상. 거래처 기존 편집엔 가드 없으나 복원엔 도입.)
3. 스냅샷 적용(service 계층): 헤더 도메인 update 메서드로 ~40필드 역적용 + **자식 전량교체**(`Partner4TabService.updateFull` 의 softDeleteAll+재등록 패턴 재사용 — shippingAddresses/contacts 재생성, priceDiscount UPSERT).
4. 복원을 신규 RESTORE revision(source_revision_no) 캡처.
5. SSE `partner:edit`(또는 `partner:restored`) broadcast(partner realtime 재사용).
6. 갱신 `PartnerFullResponse` 반환.

## 5. 권한 / 가드
- `partners.4tab.edit` page **RESTORE action**(신규 page code 미생성, D-RST-03). 신규 편집가능 가드(TERMINATED 거부). PARTNER 무관(내부 admin), MASTER bypass.

## 6. API + FE
- `GET /api/v1/partners/{code}/revisions`(VIEW, changeSummary=인접 스냅샷 diff: 헤더 변경수 + 자식 add/remove/modify) + `POST .../{n}/restore`(RESTORE). `PartnerRevisionResponse`(actorId 미노출).
- FE: `PartnerDetailDialog` 에 "버전 이력" 패널/탭(slip/estimate 패널 미러 → `PartnerVersionHistoryPanel`) — 목록·배지·changeSummary·복원 confirm·invalidate·**TERMINATED 면 복원 비활성+안내**. UUID 비노출. `api/partnerRevision.ts`.

## 7. 테스트 + QA
- BE IT(Testcontainers): create/updateProfile/updateFull 캡처, 복원(헤더+4탭 자식), 자식 add/remove 복원, **TERMINATED 복원 차단(409)**, RESTORE deny+MASTER bypass, 타임라인. `@MockBean DynamicPermissionClient` 7-action check + X-User-Id([[feedback_enforcement_real_http_test]]). (partner AbstractPostgresIT 에 DPC mock 없으면 IT 에 추가.)
- 단위: PartnerRevisionService(capture/restore/summarize), PartnerSnapshot round-trip.
- FE: typecheck + Playwright.
- **Docker 실 QA + 실사용 스크린샷**([[feedback_early_pr_docker_qa_screenshots]]): launch-local-stack → 거래처 목록→상세→4탭 편집→버전이력→복원 confirm→결과 단계별 촬영, `docs/qa/phase-2-3-partner-restore/*.png`, PR 인라인.

## 8. 범위
- IN: 거래처 마스터(헤더 + 4탭 자식) full-snapshot 버전이력 + point-in-time 복원.
- OUT: un-delete / partner_audit_logs(필드 overlay)와 통합 / BlockedPartner·CreditHistory·Attachment 복원 / 차기 shared 추출(본 4번째 도메인 후 평가).

## 9. shared 추출 재평가 (D-RST-02/05)
slip(overlay 공존+@OneToMany 라인) / estimate(단순 @OneToMany 라인) / partner(service-layer 자식 조립, @OneToMany 아님) — **3 도메인의 snapshot 조립·복원 형태가 구조적으로 달라**(도메인 메서드 vs service 조립) 공통 추출은 revision 엔티티/repository/changeSummary/채번 race 등 **인프라성 부분만** 후보. capture/restore 의 snapshot 조립·적용은 도메인별 유지가 타당. 본 슬라이스 완료 후 인프라 공통부(추상 RevisionService<TSnapshot> + 채번/JSONB/타임라인) 추출 PoC 별도 평가.
