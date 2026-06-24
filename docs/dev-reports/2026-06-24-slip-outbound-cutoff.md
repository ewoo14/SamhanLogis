# 출고전표 컷오프(마감) 시간 설정 — 인사 메뉴 (dev-report)

> 작성일: 2026-06-24 · PR #594 · 브랜치 `feat/slip-outbound-cutoff`
> spec: `docs/superpowers/specs/2026-06-24-slip-outbound-cutoff-design.md`(D1~D8) · plan: `docs/superpowers/plans/2026-06-24-slip-outbound-cutoff.md`

## 1. 개요
출고전표의 **배송태그(DeliveryTag)별 마감(컷오프) 시각**을 인사 메뉴에서 동적으로 CRUD 설정하고, **당일 출고전표에 해당 배송태그가 확정되는 시점에 마감 시각을 초과하면 생성/확정을 409로 차단**한다. 운영자는 "익일 출고"로 다시 생성한다. 견적서·주문서 자체는 무관(D1).

기본 시드(D3): **지방(REGION) 12:00 · 야적(STACK) 14:00 · 경동택배(GYEONGDONG_PARCEL) 15:00 · 경동화물(GYEONGDONG_FREIGHT) 15:00**.

## 2. 아키텍처
- **slip-service**: 컷오프 마스터 `slip_outbound_cutoff`(태그→시각, 태그당 활성 1행) + `OutboundCutoffGuard`(KST `Clock` 주입) 단일 게이트. 게이트를 **8지점**(출고 생성 6 + 배송태그 확정 2)에 배선.
- **auth-service**: page-code `hr.slip-cutoff`(PageCode enum + V70 account-mode 4-table seed, MASTER/MANAGER).
- **api-gateway**: 기존 `slip-dispatch-admin-noprefix` 라우트에 `/admin/slip-cutoffs` 추가(no-strip).
- **clients/desktop**: 인사 메뉴 설정 페이지(external_carrier 패턴) + 출력문서(DispatchDocument) 배송태그 표시.

## 3. 게이트 8지점 (D8 — "배송태그가 붙는 순간 마감 적용")
정찰 결과 출고전표는 생성 경로 6곳 중 5곳이 DRAFT를 `deliveryTag=null`로 생성하고 이후 SlipForm(editHeader)에서 영업/현장이 배송태그를 확정한다. 따라서 게이트를 생성 시점뿐 아니라 **태그 확정 시점**에도 둔다.

| # | 경로 | 위치 | 호출 |
|---|---|---|---|
| ① 수동 생성 | `SlipService.create`(OUTBOUND 분기) | `service/SlipService.java` | `createOutbound` 직후 `assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate())` |
| ② 견적변환 | `EstimateToSlipConverter.convert` | `estimate/service/...` | 동일(생성 시 태그 null → 통과) |
| ③ 모바일 주문 | `MobilePartnerOrderService` | `mobile/service/...` | 동일(태그 null → 통과) |
| ④ 견적발행 | `SlipPublishService.publishFromEstimate` | `publish/...` | 동일 |
| ⑤ 주문발행 | `SlipPublishService.publishFromPartnerOrder` | `publish/...` | 동일 |
| ⑥ 주문병합 | `SlipPublishService.publishFromOrdersMerge` | `publish/...` | 동일 |
| ⑦ 태그확정 | `SlipService.editHeader`(SlipForm 저장) | `service/SlipService.java` | applyMutation 전, `incoming!=null && incoming!=기존` 일 때만 `assertWithinCutoff(incoming, slipDate)` |
| ⑧ 태그확정 | `SlipService.updateSlip`(배치 v20) | `service/SlipService.java` | ⑦와 동일 |

- **SlipSeeder 제외**(과거일자 dev 시드 — slipDate≠today로 자동 통과).
- 태그 미변경(memo/현장명만 수정)·null 보존은 게이트 미적용(당일 전표 일반 수정 비차단).

### `OutboundCutoffGuard.assertWithinCutoff(tag, slipDate)` 로직
1. `tag==null || slipDate==null` → 통과(태그 미확정 경로 opt-in).
2. `slipDate != LocalDate.now(clock.getZone())` → 통과(미래/과거 전표).
3. 해당 태그 활성 컷오프 없음 → 통과(opt-in).
4. `LocalTime.now(clock).isAfter(cutoffTime)` → `BusinessException(CONFLICT, "{태그라벨} 당일 마감(HH:mm) 초과 — 익일 출고로 생성하세요")`. 정각(==cutoff)은 통과.

> **KST 표준**: 게이트는 KST `Clock`(TimeConfig, Asia/Seoul) 주입. 생성 경로의 기본 slipDate 도 `LocalDate.now(clock)`로 통일해 ambient JVM TZ 비의존(Codex 라운드 강화).

## 4. 데이터 모델 / 마이그
- **slip V51** `slip_outbound_cutoff`: id UUID PK · delivery_tag VARCHAR(40) · cutoff_time TIME · active BOOLEAN · BaseEntity 7 audit. 부분 unique `(delivery_tag) WHERE is_deleted=false`(태그당 1행). 기본 시드 4행 멱등(NOT EXISTS). `CREATE EXTENSION pgcrypto`(fresh probe 자급).
- **auth V70** `hr.slip-cutoff` 4-table seed(role_page_permissions + templates + group_page_permissions + account_page_permissions, MASTER ...0100/MANAGER ...0101, view/create/update/delete=TRUE, ON CONFLICT 멱등, system-master 제외 BOOL_OR).

## 5. API (slip-service, gateway `/admin/slip-cutoffs` no-strip)
- `GET /admin/slip-cutoffs`(목록) · `GET /admin/slip-cutoffs/delivery-tags`(OUTBOUND 태그 옵션) · `POST`(생성, 중복태그 409) · `PATCH /{id}`(수정) · `DELETE /{id}`(soft). 전부 `@RequirePermission(page="hr.slip-cutoff", action=...)`.

## 6. FE (clients/desktop)
- 인사 SidebarCategory "출고 마감시간 설정"(`dynamicCanAccess('hr.slip-cutoff','view')`) → `/admin/slip-cutoff`(PermissionGuard).
- `SlipCutoffConfigPage`: DataTable(태그라벨/마감시각/활성/액션) + 등록/수정 Modal(태그 select·시각 input(24시간제)·활성). 버튼 권한 **create/update/delete 분리**. UUID 비노출(testid=태그 enum).
- 권한 관리 매트릭스('관리' 그룹) + `permissionsApi` PageCode union 등록(BE↔FE parity).
- **출력문서**: `DispatchDocument`(출고전표 작업지시서 인쇄)에 배송태그를 **배송주소 앞** `[지방]` 형태 표시. 라벨은 `slipCutoff.ts` 단일 소스 공유.

## 7. 테스트 / QA
- **BE 단위/IT**: `OutboundCutoffGuardIT`(10) 생성·태그확정 경로 마감 전/후/미래/미설정 + Clock 고정(@MockBean) · `SlipCutoffAdminControllerIT`(6) CRUD+중복409+권한 · `SlipServiceTest`(Clock/cutoffGuard mock). ci.yml `slip.it.cutoff.*` 필터 등재(false-green 차단).
- **🐳 라이브 QA**(Docker, 실 게이트웨이:8080, mock OFF): 게이트 인과 **201(마감전)/409(마감후)/201(내일)** 실증 + 설정 CRUD + 인쇄 `[지방]` + SALES 권한 미노출. 증적 `docs/qa/slip-outbound-cutoff-s3/`(15스샷).

## 8. 워크플로우 회고 ([[feedback_canonical_workflow]] 8단계)
- Opus 기획+조기PR(D8/QA범위 개발책임자 결정 누적) → Codex 개발(환경한계로 쓰기 차단 → Opus 엔지니어 에이전트 구현, **듀얼모델은 리뷰에서 보존**) → Opus 5-agent 리뷰+fix+라이브QA → Codex read-only 리뷰+Opus fix+라이브 재검증 → 0수렴 재리뷰(Opus·Codex 양쪽 0) → PM 종합 → CI → 머지.
- **핵심 교훈**:
  - 정찰의 게이트 경로 **3→6→8 정정**(D6 모바일/견적변환/주문병합 누락 + D8 태그확정 editHeader). 단일 생성 게이트였으면 5경로가 마감을 빠져나갔을 것.
  - Codex MAJOR(slipDate ambient JVM TZ 의존) → 게이트 KST Clock 통일 하드닝.
  - 🚨 **컷오프 IT가 최초 실행 전까지 false-green**: ci.yml `slip.it.*`가 `slip.it.cutoff.*` 미커버(Gradle 서브패키지) → 필터 등재 후 CI에서 처음 실행되며 어서션 버그(201 vs 200, `$.message` vs `$.error.message`) + 단위테스트 Clock/cutoffGuard mock 누락 NPE 노출. **신규 IT는 ci.yml 필터 등재 + 로컬 실제 실행**이 필수([[feedback_ci_test_filter_false_green]]·[[feedback_changed_module_full_test_before_push]]).
  - 라이브 QA가 게이트웨이 stale 이미지를 단독 적발([[project_local_stack_qa_gotchas]]).
