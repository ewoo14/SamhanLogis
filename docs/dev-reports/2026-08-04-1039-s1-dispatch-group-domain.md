# 1039 S1 배차 그룹 도메인 구현 보고서

## 1. 작업 시작 상태

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 저장소 루트 확인: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- 시작 HEAD: `0fb4eac51c2f733cd23af7cc3900f1462383ebe0`
- 범위: `slip-service` S1 백엔드 도메인
- 제외: `clients/**`, 전송 구현, `PreClassifyService` 변경, Docker 조작, 전체 Gradle 스위트

## 진행 로그

- 프로젝트 맥락 확인 완료. 기존 `dispatch_vehicle_group`/`dispatch_vehicle_group_slip`는 `dispatch_task` 기반 레거시 배차 도메인이므로 신규 가배차 그룹 흐름과 테이블을 분리하는 설계를 검토 중이다.
- 현재까지 구현·테스트·참조 전수 조사는 시작하지 않았다.

## 조사 근거

### 권한 코드 실측

명령:

```powershell
rg -n --glob '!docs/qa/**' --glob '!logs/**' --glob '!**/node_modules/**' --glob '!**/build/**' 'dispatch\.board|hr\.carriers' .
```

출력 요약 원문:

```text
README.md:487 ... Flyway/권한 신규 시드 없이 `dispatch.board` 를 재사용
docs/permission-overhaul/inventory/platform-admin-notify.md:27 ... `dispatch.board` ... slip-service
clients/desktop/src/renderer/api/permissionsApi.ts:147: | 'dispatch.board'
clients/desktop/src/renderer/api/mock.ts:18605: 'dispatch.board': ['CREATE', 'UPDATE', 'DELETE', 'RESTORE']
services/slip-service/src/main/java/.../DispatchTaskAdminController.java ... @RequirePermission(page = "dispatch.board", ...)
```

`dispatch.board`는 프런트 permission 키·백엔드 가드·문서/권한 catalog에 실재하므로 재사용한다. `hr.carriers`는 위 grep 결과에 없으므로 S1에서 신설 page code로 취급하고, 다음 라운드 FE/권한 DB catalog 동기화 대상으로 명시한다.

### `dispatch_vehicle_group` 레거시 판정 근거

`dispatch_vehicle_group`와 `dispatch_vehicle_group_slip`는 참조 0건이 아니다. `DispatchVehicleGroup`, `DispatchVehicleGroupSlip`, `DispatchTaskService`, `DispatchTaskDecisionService`, V21 `dispatch_task` migration 및 기존 dispatch IT가 연결된 기존 `dispatch_task` aggregate다. 따라서 이번 `dispatch_date` 기반 가배차 그룹과 의미·수명주기가 달라 기존 계열을 레거시로 보존하고 신규 `dispatch_groups` 계열을 분리한다.

## 구현 진행 로그

- TDD RED 원문: `:services:slip-service:test --tests ...DispatchGroupDomainTest`에서 신규 `dispatchgroup` 패키지/타입 부재로 `18 errors`, `BUILD FAILED`.
- 도메인 GREEN 원문: 동일 focused test가 `BUILD SUCCESSFUL`, `18 actionable tasks: 3 executed, 15 up-to-date`.
- 확정 스키마: `carriers`, `dispatch_groups`, `dispatch_group_slips`; 편입 유형 컬럼은 기존 `slips.slip_type`과 충돌하지 않도록 `inclusion_type`으로 확정했다. `dispatch_group_slips.slip_id -> slips(id) ON DELETE RESTRICT`, 활성 전표 중복은 `ux_dispatch_group_slips_slip_active` partial unique index로 차단한다.
- `carrier.partner_id`는 partner-service logical reference UUID이며 교차 서비스 FK를 만들지 않았다.
- V104는 BaseEntity 7 audit/soft-delete, 운송사 `AROLOGIS` 단일 시드(`is_arologis=true`)만 추가한다. 기존 컬럼 DROP은 없다.
- 양방향 삭제 보호: 편입 시 활성 `Slip`만 허용하고, `SlipService.softDelete`, `SlipDeleteService.delete`, `SalesSlipDeleteService.delete` 모두 활성 그룹 참조를 먼저 거부한다. carrier 삭제도 활성 그룹 지정 중이면 거부하고 비활성화만 허용한다.

## 종료조건 ① 새 조합 열거 및 실제 확인

| 새 조합 | 보장/실제 확인 |
|---|---|
| 운송사 없는 그룹 | `DispatchGroup.create` 및 lifecycle IT에서 `carrierId=null` 생성 확인 |
| OUTBOUND 전표 편입 | 활성 판매전표를 `inclusion_type=OUTBOUND`로 lifecycle IT에서 편입 |
| INBOUND 전표 편입 | 활성 구매전표를 `inclusion_type=INBOUND`로 lifecycle IT에서 편입 |
| 같은 전표를 두 그룹에 담음 | application guard + `ux_dispatch_group_slips_slip_active` partial unique; lifecycle IT에서 두 번째 편입이 `이미 다른 활성 배차 그룹`으로 거부 |
| 그룹에 담긴 전표를 삭제 | 편입 시 활성 전표만 조회하고, 삭제 진입점 3곳의 guard가 먼저 거부; lifecycle IT에서 `먼저 그룹에서 제외해야 삭제` 확인 |
| 운송사 비활성화 후 기존 그룹 | `is_active=false`로 전환해도 기존 `carrier_id` 기록은 보존하며, lifecycle IT에서 해당 운송사를 새 그룹에 재지정하면 `비활성` 거부 |
| 삭제된 운송사와 활성 그룹 | 활성 그룹이 참조 중이면 carrier soft-delete 자체를 거부하여 그룹 응답 단절을 방지 |
| 그룹 soft-delete와 편입 전표 | 그룹 삭제 시 mapping도 soft-delete, FK는 `ON DELETE RESTRICT`라 물리 삭제 연쇄 없음 |
| 전송 상태 조합 | 신규 그룹 기본값은 `NOT_SENT`; S1에서는 SENT/FAILED 전이 API를 만들지 않음 |

실행 명령:

```powershell
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.dispatchgroup.DispatchGroupDomainTest --tests com.samhanair.logis.slip.it.dispatchgroup.DispatchGroupContextIT --tests com.samhanair.logis.slip.it.dispatchgroup.DispatchGroupLifecycleIT
```

출력 원문:

```text
TEST-com.samhanair.logis.slip.dispatchgroup.DispatchGroupDomainTest.xml: tests=2 failures=0 errors=0 skipped=0
TEST-com.samhanair.logis.slip.it.dispatchgroup.DispatchGroupContextIT.xml: tests=1 failures=0 errors=0 skipped=0
TEST-com.samhanair.logis.slip.it.dispatchgroup.DispatchGroupLifecycleIT.xml: tests=2 failures=0 errors=0 skipped=0
BUILD SUCCESSFUL in 30s
```

## 종료조건 ② 새 식별자·엔드포인트 참조 전수

실행 명령:

```powershell
rg -n --glob '!**/build/**' --glob '!docs/qa/**' 'dispatch_groups|dispatch_group_slips|inclusion_type|hr\.carriers|/admin/dispatch-groups|/admin/carriers|DispatchGroup|CarrierAdminController|DispatchGroupAdminController' services/slip-service docs/dev-reports/2026-08-04-1039-s1-dispatch-group-domain.md
```

출력 원문 핵심:

```text
services/slip-service/.../V104__create_dispatch_group_domain.sql:26 CREATE TABLE dispatch_groups
services/slip-service/.../V104__create_dispatch_group_domain.sql:52 CREATE TABLE dispatch_group_slips
services/slip-service/.../V104__create_dispatch_group_domain.sql:56 inclusion_type ... OUTBOUND/INBOUND
services/slip-service/.../DispatchGroupAdminController.java:27 @RequestMapping("/admin/dispatch-groups")
services/slip-service/.../CarrierAdminController.java:25 @RequestMapping("/admin/carriers")
services/slip-service/.../CarrierAdminController.java:31/36/40/44 @RequirePermission(page = "hr.carriers", ...)
services/slip-service/.../SlipService.java, SlipDeleteService.java, SalesSlipDeleteService.java: DispatchGroupSlipReferenceGuard
```

기존 `PreClassifyService`, 기존 `dispatch_vehicle_group` 계열, `clients/**`에는 새 식별자 연결을 추가하지 않았다.

## 종료조건 ③ 영향 테스트·금지 범위 확인

실행 명령:

```powershell
git diff --check
git diff --name-only | Select-String 'clients/|clients\\|PreClassifyService|V10[0-3]__'
Get-ChildItem services/slip-service/src/main/resources/db/migration/V104__create_dispatch_group_domain.sql | Select-Object -ExpandProperty Name
```

출력 원문:

```text
--- diff check ---
--- forbidden tracked-name check ---
--- new migration/version check ---
V104__create_dispatch_group_domain.sql
```

Spring 컨텍스트 IT는 실제 Testcontainers PostgreSQL에서 Flyway V104까지 적용되었고, `AROLOGIS` seed 1건 및 `dispatch_group_slips` FK를 확인했다.

## 변경 파일

### 기존 파일 수정

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDeleteService.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SalesSlipDeleteService.java`

### 신규 파일

- `services/slip-service/src/main/resources/db/migration/V104__create_dispatch_group_domain.sql`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatchgroup/*`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatchgroup/*`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/dispatchgroup/*`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatchgroup/*`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatchgroup/*`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/dispatchgroup/DispatchGroupDomainTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/dispatchgroup/DispatchGroupContextIT.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/dispatchgroup/DispatchGroupLifecycleIT.java`
- `docs/superpowers/plans/2026-08-04-1039-s1-dispatch-group-domain.md`
- `docs/dev-reports/2026-08-04-1039-s1-dispatch-group-domain.md`

커밋·push는 수행하지 않았다.

## 최종 fresh verification

```text
.\gradlew.bat :services:slip-service:test --tests ...DispatchGroupDomainTest --tests ...DispatchGroupContextIT --tests ...DispatchGroupLifecycleIT
BUILD SUCCESSFUL in 28s
18 actionable tasks: 2 executed, 16 up-to-date
git diff --check: 출력 없음
금지 범위 grep: 출력 없음
```
