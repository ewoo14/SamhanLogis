# 설계 — 견적(Estimate) RESTORE 버전이력 + point-in-time 복원 (Phase 2.2)

> RESTORE 도메인 확장 2번째 슬라이스. slip(2.1) 패턴(D-RST-01~03)을 견적에 적용. inventory(2.2 초안)는 적합 대상 부재로 보류(D-RST-04).
> 브레인스토밍 확정: 2026-05-29. grounding 으로 명료화 완료(편집 가능 / 헤더+라인 / 편집 잠금 상태 확인).

## 1. 목적 / 배경

견적서는 주문 전환 전 활발히 편집되는 헤더+라인 전표로, slip 과 **동형이자 더 단순**(기존 audit/overlay 없음 → 공존 불필요). slip 의 full-snapshot+point-in-time RESTORE 를 견적에 이식한다.

### grounding 확정 사실 (slip 대비)
- 위치: **slip-service** sub-domain `com.samhanair.logis.slip.estimate.*`.
- `Estimate`(헤더, `@Version Long version`, BaseEntity soft-delete) + `EstimateLine`(라인) `@OneToMany cascade ALL orphanRemoval`.
- `EstimateStatus`: `QUOTE_DRAFT → QUOTE_SENT → QUOTE_ACCEPTED → QUOTE_CONVERTED`(+`QUOTE_REJECTED`). `EDITABLE_STATUSES = {QUOTE_DRAFT, QUOTE_SENT}`, `requireEditable()` 가 ACCEPTED+ 차단(CONFLICT).
- `EstimateService.update` = **라인 전량교체**(removeLine loop + addLine). `create`/`update`/`editHeader`/`addLine`/`removeLine` 모두 `requireEditable` 가드.
- **기존 audit/revision 0** (slip 의 overlay 공존 부담 없음 → 단일 revision 채널).
- Flyway slip-service 최신 V27 → 다음 **V28**. JSONB 선례 `SlipRevision`(@JdbcTypeCode JSON).
- `EstimateController` prefix `/slips/estimates`, `@RequirePermission(estimates.list, CREATE/UPDATE)` + `EstimatePermissionGuard`(PAGE_CODE="estimates.list"). 응답 `EstimateDetailResponse.from`. actor X-User-Id/Role(X-User-Name 미사용 → 추가).
- estimate BE **SSE 채널 없음**(FE EstimateRealtimeClient 는 미연결).
- FE `EstimateDetailPage.tsx` + `api/estimateApi.ts`.

## 2. 데이터 모델

신규 `estimate_revisions` (slip-service, Flyway `V28`): `slip_revisions`(V27) 동형.

| 컬럼 | 설명 |
|---|---|
| `id` UUID PK · `estimate_id` UUID(FK 미강제) · `revision_no` INT · `revision_type` VARCHAR(16)(CREATE/EDIT/RESTORE) · `source_revision_no` INT NULL · `estimate_no` VARCHAR · `estimate_date` DATE · `snapshot` JSONB(헤더+라인) · `actor_id`/`actor_name`/`actor_color` · BaseEntity audit 7(created_by VARCHAR(50) NOT NULL 등 V27 정합) |

- partial unique `(estimate_id, revision_no) WHERE is_deleted=FALSE` + `(estimate_id, revision_no DESC)` 인덱스.
- `@JdbcTypeCode(SqlTypes.JSON)` snapshot. 전용 `EstimateSnapshot` record(헤더 값 + `List<Line>`).

## 3. 캡처 흐름

`EstimateRevisionService.capture(estimate, type, sourceRev, actor)`:
- `EstimateService.create`(CREATE), `update`(EDIT), 복원(RESTORE). (slip 과 달리 overlay/개별 addLine 외부 경로 없음 — update 가 전량교체라 단일 진입.)
- 단 `editHeader`/`addLine`/`removeLine` 가 service 공개 경로로 별도 노출되면 그 경로에도 capture 훅(누락 0 — slip D-RST-03 교훈). 현재 EstimateService 는 update 단일 경로이나 확인 후 전 content-mutation 에 훅.
- 편집과 동일 tx, full snapshot, actor(X-User-Id/Name, UUID 비공개).

## 4. 복원(RESTORE) 흐름

`POST /slips/estimates/{estimateId}/revisions/{revisionNo}/restore`, `@RequirePermission(page="estimates.list", action=RESTORE)`:
1. 대상 revision 스냅샷 로드(없으면 404).
2. **편집 가능 가드**: `estimate.requireEditable()`(EDITABLE_STATUSES = QUOTE_DRAFT/QUOTE_SENT). ACCEPTED/CONVERTED/REJECTED → CONFLICT(409). (slip 마감 lock / inventory pre-ship 과 동일 사상 — 잠긴 견적 복원 불가.)
3. 스냅샷 적용: 헤더 덮어쓰기 + 라인 전량교체(EstimateService.update 의 교체 로직 재사용). `recalculateTotals()` 로 합계 재계산(스냅샷 합계 무시, 라인 기준 재계산 — slip lineTotal 재계산과 동일 사상).
4. 복원을 신규 RESTORE revision(source_revision_no) 캡처.
5. 갱신 `EstimateDetailResponse` 반환. **SSE 없음**(FE 복원 응답으로 invalidate).

## 5. 권한 / 가드
- `estimates.list` page **RESTORE action** 추가(신규 page code 미생성, D-RST-03). EstimatePermissionGuard 에 checkRestore(또는 기존 checkEdit 패턴) 추가 검토 — 단 aspect `@RequirePermission(estimates.list, RESTORE)` 가 1차 게이트.
- 편집 가능 상태 가드. PARTNER deny(내부), MASTER bypass.

## 6. API + FE
- `GET /slips/estimates/{id}/revisions`(VIEW, changeSummary=인접 스냅샷 diff) + `POST .../{n}/restore`(RESTORE).
- FE: `EstimateDetailPage` 에 버전이력 패널(`SlipVersionHistoryPanel` 미러 → `EstimateVersionHistoryPanel`), `estimateApi.ts` 에 listRevisions/restoreRevision. 복원 confirm + react-query invalidate(['estimate',id]+revisions). **잠긴 견적이면 복원 버튼 비활성/안내**. UUID 비노출.

## 7. 테스트
- BE IT(Testcontainers): create/update 캡처, QUOTE_DRAFT/SENT 복원(헤더+라인), **ACCEPTED/CONVERTED 복원 차단(409)**, RESTORE deny+MASTER bypass, 타임라인. `@MockBean DynamicPermissionClient` 7-action check + X-User-Id([[feedback_enforcement_real_http_test]]).
- 단위: EstimateRevisionService(capture/restore/summarize), Estimate.restoreFromSnapshot(라인 전량교체 + requireEditable).
- FE: typecheck + Playwright.

## 8. 범위
- IN: 견적 full-snapshot 버전이력 + 편집가능-상태 point-in-time 복원.
- OUT: SSE(estimate broker 부재) / un-delete / shared revision 추출(3번째 도메인 = 본 슬라이스 → slip+estimate 공통부 추출 검토 시점이나, slip(필드+overlay)·estimate(단순) 형태 차이로 D-RST-02대로 신중 — 후속) / 견적→슬립 전환(convert) 이력.

## 9. 분해 (RESTORE 로드맵 D-RST-02)
2.1 slip(완료) · inventory(보류 D-RST-04) · **2.2 estimate(본 슬라이스, 3번째 적용 도메인)**. 본 슬라이스 후 slip+estimate 공통부(revision 엔티티/service/changeSummary/JSONB 캡처) shared 추출 타당성 재평가(estimate 가 slip 보다 단순해 공통 형태가 더 분명해질 것).
