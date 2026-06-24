# 출고전표 컷오프(마감) 시간 설정 — 인사 메뉴 Implementation Plan

> **실행 = canonical workflow([[feedback_canonical_workflow]])**: Opus 기획+조기PR → **Codex 개발** → Opus·Codex 순차 듀얼리뷰(각 라운드 라이브QA 스샷) → 0수렴 → PM 종합 → 머지. Claude 직접 구현 금지(리뷰 라운드 fix 예외). 체크박스 추적. spec=`docs/superpowers/specs/2026-06-24-slip-outbound-cutoff-design.md`(D1~D7).

**Goal:** 출고전표 배송태그별 컷오프(마감) 시각을 인사 메뉴에서 동적 설정 + **당일 출고전표 생성 시 마감 초과면 409 차단**("익일 출고로 생성하세요").

**Architecture:** slip-service `slip_outbound_cutoff` 마스터(태그→시각 CRUD) + `OutboundCutoffGuard`(slipDate=today AND 활성 cutoff AND now(KST)>cutoff → 409). **D8(개발책임자 Option B): 게이트 = 출고 생성 6경로(`Slip.createOutbound` 직후) + 배송태그 확정 2경로(`editHeader` 태그 신규/변경 시) = 8지점**(SlipSeeder 제외). 5/6 생성경로는 DRAFT를 태그 null로 만들고 SlipForm/editHeader에서 태그 확정 → "태그 붙는 순간 마감 적용". auth V70(V66 4-table seed, page-code `hr.slip-cutoff` MASTER/MANAGER) + PageCode enum. FE 인사 메뉴 설정화면(external_carrier 페이지 패턴). **external_carrier 마스터(슬2)·account-mode·V66 seed 재사용.**

**Tech Stack:** Spring Boot 3 / Java 17 / JPA(slip-service, auth); React + TS + design-system(desktop). Testcontainers IT(Clock 고정), vitest.

## Global Constraints
- **Flyway 신규**: slip **V51**(slip_outbound_cutoff 테이블 + 기본 시드 4행) + auth **V70**(hr.slip-cutoff 권한). 적용 마이그 불변([[feedback_applied_migration_immutable]]) · fresh probe([[feedback_migration_fresh_postgres_probe]]). **현 최신 slip=V50→V51, auth=V69→V70**(확인).
- **DeliveryTag enum 값 추가 없음**(기존 OUTBOUND 8종: DAY/STACK/REGION/LOGEN/GYEONGDONG_PARCEL/GYEONGDONG_FREIGHT/RENTAL/RETURN_RENTAL). delivery_tag=enum name VARCHAR 저장.
- **기본 시드(V51)**: REGION 12:00:00 · STACK 14:00:00 · GYEONGDONG_PARCEL 15:00:00 · GYEONGDONG_FREIGHT 15:00:00 (active=true).
- **KST**: TimeConfig `Clock`(Asia/Seoul) 주입 — `LocalDate.now(clock.getZone())`/`LocalTime.now(clock)`. 테스트 고정 Clock.
- **권한**: page-code `hr.slip-cutoff`, MASTER/MANAGER(account-mode, group 100/101), @RequireDepartment 미사용. FE canAccess=BE @RequirePermission 정확 일치([[feedback_fe_canaccess_pagecode_be_match]]).
- 🚨 **게이트 = 전 8지점**(D6 "모든 출고 생성 경로" + D8 "생성+태그확정 양쪽", 정찰 grep 확정 — 회사PC 초안 "3경로" 오류 정정): **생성 6경로**(`Slip.createOutbound` 직후 `assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate())`) — ①`SlipService.java:218`(수동) ②`EstimateToSlipConverter.java:56`(견적변환) ③`MobilePartnerOrderService.java:107`(모바일) ④`SlipPublishService.java:137`(견적발행) ⑤`:206`(주문발행) ⑥`:294`(주문병합) — + **태그확정 2경로**(`editHeader` 태그 신규/변경 시) ⑦`SlipService.java:314`(editHeader 엔드포인트=SlipForm 저장) ⑧`:~385`(배치 헤더수정). **`SlipSeeder` 제외**. **누락=silent regression이므로 IT로 생성(수동·마감후 409)+태그확정(DRAFT→마감후 editHeader 태그설정 409)+모바일/발행 배선 커버**.
- UUID 비노출(태그 라벨 노출) · Role 풀네임 · 한국어 · 단계별 스샷 QA · docs 동기화.

## File Structure
**slip-service (BE)** — 신규: `domain/cutoff/SlipOutboundCutoff.java`, `repository/cutoff/SlipOutboundCutoffRepository.java`, `service/cutoff/{SlipOutboundCutoffService, OutboundCutoffGuard}.java`, `web/cutoff/SlipOutboundCutoffController.java`, `dto/cutoff/{CutoffUpsertRequest, CutoffResponse}.java`, `resources/db/migration/V51__slip_outbound_cutoff.sql`. 수정(게이트 6곳): `service/SlipService.java`, `estimate/service/EstimateToSlipConverter.java`, `mobile/service/MobilePartnerOrderService.java`, `publish/SlipPublishService.java`(3곳). 테스트: `it/cutoff/SlipOutboundCutoffControllerIT.java`, `it/cutoff/OutboundCutoffGuardIT.java`(Clock 고정·전 경로 커버).
**auth-service** — 수정 `domain/PageCode.java`(hr.slip-cutoff), 신규 `V70__seed_hr_slip_cutoff_page_codes.sql`(V66 4-table).
**api-gateway** — 수정 `application.yml`(/admin/slip-cutoffs no-strip).
**clients/desktop (FE)** — 신규 `routes/admin/SlipCutoffConfigPage.tsx`, `api/slipCutoff.ts`; 수정 `components/AppLayout.tsx`(인사 SidebarLink), `routes/index.tsx`, `api/mock.ts`, `api/permissionsApi.ts`, `routes/PermissionMatrixPage.tsx`. 테스트 `routes/admin/SlipCutoffConfigPage.test.ts`.

---

## Task 1 — BE: slip_outbound_cutoff 엔티티 + V51 + Repository
**Files:** `domain/cutoff/SlipOutboundCutoff.java`(C) · `V51__slip_outbound_cutoff.sql`(C) · `repository/cutoff/SlipOutboundCutoffRepository.java`(C)
- [ ] **Step 1: V51** — `slip_outbound_cutoff`: id UUID PK, delivery_tag VARCHAR(40) NOT NULL, cutoff_time TIME NOT NULL, active BOOLEAN NOT NULL DEFAULT true, + BaseEntity 7 audit(V49/V50 타입 동일). 부분 unique `CREATE UNIQUE INDEX ux_slip_outbound_cutoff_tag ON slip_outbound_cutoff(delivery_tag) WHERE is_deleted=false`. **기본 시드 4행 INSERT**(REGION 12:00·STACK 14:00·GYEONGDONG_PARCEL 15:00·GYEONGDONG_FREIGHT 15:00, created_by='v51-cutoff-seed'). fresh probe.
- [ ] **Step 2: 엔티티** — SlipOutboundCutoff(@Entity @Table @SQLRestriction("is_deleted=false") @UuidGenerator, BaseEntity): deliveryTag(@Enumerated(STRING) DeliveryTag), cutoffTime(LocalTime), active. 정적 팩토리 create(deliveryTag, cutoffTime) + update(cutoffTime, active)/activate/deactivate. OUTBOUND 태그만 허용 검증(create 시 deliveryTag.getDirection()==OUTBOUND, 아니면 IllegalArgument→서비스서 400).
- [ ] **Step 3: Repository** — findAllByIsDeletedFalseOrderByDeliveryTag, **findByDeliveryTagAndIsDeletedFalse(DeliveryTag)**(게이트·중복검증), findDeletedById(native restore 선택). 커밋.

## Task 2 — BE: OutboundCutoffGuard + 게이트 전 8지점(생성6+태그확정2) + 게이트 IT
> 🚨 **D8(개발책임자 2026-06-24 추가결정 — Option B "생성 + 태그확정 양쪽")**: 5/6 생성 경로는 DRAFT를 태그 null로 만들고 이후 **SlipForm(editHeader)에서 배송태그를 확정**한다(코드 주석 확인: EstimateToSlipConverter:51 "영업이 SlipForm으로 정확한 창고 지정 후 SAVED"). 따라서 게이트를 **생성 6경로 + editHeader(태그 신규/변경) 2경로** = 총 8지점에 둔다. "출고전표에 배송태그가 붙는 순간 마감 적용"(개발책임자).

**Files:** `service/cutoff/OutboundCutoffGuard.java`(C) · `SlipService.java`(M — create 1 + editHeader 2) · `EstimateToSlipConverter.java`(M) · `MobilePartnerOrderService.java`(M) · `SlipPublishService.java`(M, 3곳) · `it/cutoff/OutboundCutoffGuardIT.java`(Test)
**Interfaces (Produces):** `OutboundCutoffGuard.assertWithinCutoff(DeliveryTag tag, LocalDate slipDate)`.
- [ ] **Step 1: OutboundCutoffGuard** — @Component, Clock + SlipOutboundCutoffRepository 주입. `assertWithinCutoff(tag, slipDate)`: **tag null 또는 slipDate null이면 return**(R2 opt-in — 생성 시 태그 null인 deferred 경로 자동 통과, 태그 확정 시 editHeader 게이트가 잡음); `if (!slipDate.equals(LocalDate.now(clock.getZone()))) return;`(미래/과거 통과); repo.findByDeliveryTagAndIsDeletedFalse(tag) 없거나 `!active`이면 return(opt-in); `if (LocalTime.now(clock).isAfter(cutoff.getCutoffTime())) throw new BusinessException(ErrorCode.CONFLICT, tag.getKoreanLabel()+" 당일 마감("+HH:mm+") 초과 — 익일 출고로 생성하세요");`. 한국어 Javadoc.
- [ ] **Step 2a: 생성 게이트 6경로** — 각 `Slip.createOutbound(...)` 직후·save 직전에 `cutoffGuard.assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate());` 삽입(slip에서 읽어 경로별 분기 불요·미래 안전). 6곳: ①`SlipService.java:218` ②`EstimateToSlipConverter.java:56`(생성자 guard 주입) ③`MobilePartnerOrderService.java:107` ④`SlipPublishService.java:137` ⑤`:206` ⑥`:294`. **`SlipSeeder` 제외**(과거일자 시드). 각 서비스 생성자/필드에 `OutboundCutoffGuard` 주입.
- [ ] **Step 2b: 태그확정(editHeader) 게이트 2경로** — `SlipService.java:314 editHeader(EditHeaderRequest)` + `:~385 배치 헤더 수정` 두 곳에서, editHeader 적용 **전에** "태그가 신규/변경되는 경우만" 게이트: `DeliveryTag incoming = req.deliveryTag(); if (incoming != null && incoming != slip.getDeliveryTag()) cutoffGuard.assertWithinCutoff(incoming, slip.getSlipDate());` → 통과 시 기존 `applyMutation(() -> slip.editHeader(...))` 진행. **태그 미변경(memo/driver만 수정)·null 보존(line 355 driver-only)은 게이트 안 함**(기존 당일 전표 일반 수정 차단 방지 — 개발책임자 의도 "태그 붙는 순간"만). slipDate=slip.getSlipDate()(생성 시 날짜) 사용.
- [ ] **Step 3: OutboundCutoffGuardIT**(AbstractPostgresIT, **고정/가변 Clock @TestConfiguration 또는 @MockBean Clock**): 시드 REGION 12:00 기준 —
  - **생성 경로**: ①마감 전(11:00) slipDate=today REGION 수동 생성 200 ②마감 후(13:00) 409 ③미설정 태그(DAY) 통과 ④slipDate=내일 통과 ⑤발행/모바일 경로(태그 null) 마감 후에도 생성 통과(=정상, 태그 확정 전).
  - **태그확정(editHeader) 경로(D8 핵심)**: ⑥마감 전 DRAFT(REGION null 또는 견적변환) 생성 → 마감 후(13:00) editHeader로 REGION 태그 설정 → **409**("지방 당일 마감(12:00) 초과"). ⑦마감 후 editHeader지만 **태그 미변경(memo만)** → 통과(기존 전표 일반수정 비차단). ⑧마감 전 editHeader로 태그 설정 → 200.
  - 커밋.

## Task 3 — BE: Service + Controller + DTO + CRUD IT + PageCode + auth V70
**Files:** `service/cutoff/SlipOutboundCutoffService.java`(C) · `web/cutoff/SlipOutboundCutoffController.java`(C) · `dto/cutoff/*.java`(C) · `it/cutoff/SlipOutboundCutoffControllerIT.java`(Test) · auth `PageCode.java`(M) · auth `V70`(C)
- [ ] **Step 1: DTO** — CutoffUpsertRequest(deliveryTag @NotNull, cutoffTime @NotNull LocalTime, active default true), CutoffResponse(id·deliveryTag·deliveryTagLabel(getKoreanLabel)·cutoffTime·active·audit). UUID는 라우팅용(화면 라벨=태그).
- [ ] **Step 2: Service** — list(전체 active 정렬)/create(태그 OUTBOUND 검증+활성중복 409)/update/delete(soft)/restore. WarehouseService/ExternalCarrierService 패턴.
- [ ] **Step 3: Controller** `/admin/slip-cutoffs` — GET=@RequirePermission(page="hr.slip-cutoff", VIEW); POST=CREATE; PATCH/{id}=UPDATE; DELETE/{id}=DELETE. account-mode.
- [ ] **Step 4: PageCode enum** — auth `domain/PageCode.java` 인사/admin 섹션에 `HR_SLIP_CUTOFF("hr.slip-cutoff","출고 마감시간 설정")`.
- [ ] **Step 5: auth V70** — V66/V69 4-table seed(role_page_permissions+templates+group+account). page-code hr.slip-cutoff, MASTER(group …100)/MANAGER(…101) view+create+update+delete=TRUE. fresh probe. **현 최신 auth=V69→V70.**
- [ ] **Step 6: SlipOutboundCutoffControllerIT** — CRUD happy + 활성중복 409 + 권한(MANAGER 200·타 role 403, AbstractPostgresIT base stub). 커밋.

## Task 4 — gateway + FE
**Files:** gateway `application.yml`(M) · `api/slipCutoff.ts`(C) · `routes/admin/SlipCutoffConfigPage.tsx`(C) · `AppLayout.tsx`(M) · `routes/index.tsx`(M) · `api/mock.ts`(M) · `api/permissionsApi.ts`(M) · `routes/PermissionMatrixPage.tsx`(M) · `SlipCutoffConfigPage.test.ts`(Test)
- [ ] **Step 1: gateway** — slip admin no-strip 라우트(/admin/external-carriers·/admin/external-dispatches 옆)에 `/admin/slip-cutoffs,/admin/slip-cutoffs/**` 추가.
- [ ] **Step 2: api/slipCutoff.ts** — list/create/update/remove + 타입(SlipCutoff: id·deliveryTag·deliveryTagLabel·cutoffTime·active). OUTBOUND DeliveryTag 상수(라벨 맵).
- [ ] **Step 3: SlipCutoffConfigPage.tsx** — ExternalCarriersPage 패턴. DataTable(태그라벨/마감시각/활성/액션) + 등록/수정 Modal(태그 select=미설정 OUTBOUND 태그 + `<input type="time">` + 활성) + soft-delete. canAccess('hr.slip-cutoff','create')로 관리 노출. 태그 라벨 한국어. testid=태그 enum.
- [ ] **Step 4: AppLayout** — 인사 SidebarCategory(showAdminHrGroup 인근)에 `showSlipCutoff=dynamicCanAccess('hr.slip-cutoff','view')` + SidebarLink("출고 마감시간 설정", to=/admin/slip-cutoffs) + 인사 그룹 show OR + activeTargets.
- [ ] **Step 5: routes/index.tsx** — /admin/slip-cutoffs → PermissionGuard(pageCode="hr.slip-cutoff", action="view") > SlipCutoffConfigPage. + permissionsApi PageCode union + PermissionMatrixPage(인사 그룹) 등록.
- [ ] **Step 6: mock.ts** — /admin/slip-cutoffs GET/POST/PATCH/DELETE(3원칙) + 기본 시드 4행 + 권한 mock(hr.slip-cutoff MASTER/MANAGER). 
- [ ] **Step 7: vitest** — 목록 렌더·canAccess 가드·태그 select·time 검증. typecheck+vitest GREEN. 커밋.

## Task 5 — docs 동기화
- [ ] README/ROADMAP/overview에 출고 컷오프 설정 반영 + dev-report `docs/dev-reports/2026-06-24-slip-outbound-cutoff.md`(3-layer).

## QA (각 리뷰 라운드 Docker 라이브 + 단계별 스샷)
①인사 메뉴 "출고 마감시간 설정" 진입 ②기본 시드(지방12/야적14/경동15) 표시 ③태그 추가/시각 수정 ④마감 전 시각 출고전표(해당 태그·당일) 생성 200 ⑤마감 후 생성 409("익일 출고") ⑥권한 없는 role 메뉴 미노출. 실 게이트웨이:8080·mock OFF·각 단계 스샷. (시각 의존 QA는 시드 시각 조정 or 시스템시각 활용 — 정직 기록.)

## Self-Review (spec D1~D7 대조)
- OUTBOUND DeliveryTag별 cutoff CRUD(D2·D5) = Task1·3. 기본 시드(D3) = V51. 409 차단(D4) = Task2 Guard. 모든 생성경로(D6) = 게이트 3곳+IT. page-code hr.slip-cutoff MASTER/MANAGER(D7) = Task3·auth V70. ✓
- 견적/주문 무관(D1) — 게이트는 출고 Slip 생성만(slipType OUTBOUND), 견적/주문 자체 생성엔 미적용. ✓
- KST Clock·Flyway V51/V70 fresh probe·account-mode·UUID 비노출. ✓
