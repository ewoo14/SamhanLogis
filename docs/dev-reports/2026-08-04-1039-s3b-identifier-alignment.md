# S3b 식별자 정렬 구현 보고서

## ① 워크트리·HEAD

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 루트 확인: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- HEAD: `0cbb543d062a8378021502b83bd315c787a756b0`

## ② 고른 지목 키와 근거

- 그룹: `groupNo`. V104 `ux_dispatch_groups_group_no_active`가 `is_deleted = FALSE` 행만 유일하게 보장한다.
- 운송사: `carriers.code`. V104 `ux_carriers_code_active`가 활성 행 기준 유일성을 보장한다.
- 전표: `slipNo + inclusionType`. V24 `ux_slips_slip_type_no_active`가 `(slip_type, slip_no)` 활성 행 기준 유일성을 보장한다.
- 내부 조인은 기존 `dispatch_groups.carrier_id`, `dispatch_group_slips.slip_id` UUID를 유지하되 공개 경로·요청·응답에서는 사용하지 않는다.
- `dispatch_groups`, `carriers`, `dispatch_group_slips`에 V105 `version BIGINT NOT NULL DEFAULT 0`을 추가하고 JPA `@Version`을 적용했다. 기존 행은 0으로 기동하며 삭제/드롭은 없다.
- 낙관적 잠금 충돌은 기존 slip-service 전역 핸들러의 `409 CONFLICT` 및 `동시 수정 충돌 — 다시 시도해 주세요`로 사용자에게 전달된다.

## ③ RED 5개 원문

```text
RED-A1  응답으로 받은 식별자만으로 그룹 수정·삭제가 된다
RED-A2  판매전표·구매전표를 그룹에 편입/제외하고 순서를 바꿀 수 있다
RED-A3  그룹에 운송사를 지정·해제할 수 있다
RED-B1  삭제된 행이 같은 코드로 잡히지 않는다
RED-B2  S1 가드(전표당 1그룹·삭제 전표 차단·비활성 운송사 차단)가 그대로 동작한다
```

TDD RED 원문:

```text
dispatchGroupApi.reorder is not a function
```

## ④ 새 조합 목록과 결과

| 조합 | 결과 |
|---|---|
| 그룹 삭제 후 같은 `groupNo`로 새 그룹 생성 | 활성 partial unique가 삭제행을 제외한다. `create` 중복 검사와 `load(groupNo)` 모두 `findByGroupNoAndIsDeletedFalse`를 사용한다. |
| A 그룹에서 전표를 제외한 뒤 B 그룹으로 이동 | `removeSlip(groupNo, slipNo)`가 활성 A만 지목하고 soft delete한 뒤, 활성 전표 조회와 `ux_dispatch_group_slips_slip_active`를 통과해야 B 편입이 된다. |
| `carrier.code` 변경 | 수정 URL은 기존 활성 code, 요청 body의 새 code를 사용한다. 이후 그룹 응답은 내부 carrier UUID 조인으로 새 code를 반환하며, 새 code로 다시 지정할 수 있다. 활성 중복 code는 409다. |
| 삭제 운송사와 같은 code 재생성 | `load(code)`가 활성 행만 찾으므로 삭제행을 잡지 않는다. 활성 그룹 참조 중 운송사 soft delete는 S1 guard가 거부한다. |
| 비활성 운송사 지정 | `CarrierService.load(code)`는 비활성 행 자체는 찾지만 `DispatchGroup.assignCarrier`가 비활성을 거부한다. |
| 삭제 전표 편입 | `findBySlipTypeAndSlipNoAndIsDeletedFalse`가 삭제행을 제외해 404를 낸다. |
| 동시 그룹 수정/삭제/운송사 지정 | 그룹 `@Version`, 매핑 `@Version`, 운송사 `@Version`이 stale update를 감지하고 409로 반환한다. |

## ⑤ 종료조건 3종 명령·출력 원문

### 1. 새 조합 열거

```text
명령: (수동 검토) groupNo 삭제→재생성, A→B 전표 이동, carrier code 변경, 삭제행 동명 재생성, 비활성 운송사 지정, 삭제 전표 편입, 동시 수정 경로를 위 표에 기록.
출력: 활성 partial unique 조회 + S1 guard + @Version 충돌 경로 확인 완료.
```

### 2. 참조 전수

```text
명령: rg -n "DispatchGroupRequests|CarrierRequests|dispatchGroupApi|carrierApi|/admin/dispatch-groups|/admin/carriers" services/slip-service/src/main/java services/slip-service/src/test clients/desktop/src/renderer clients/desktop/playwright/1039-s3-dispatch-group-mock.spec.ts --glob '!**/node_modules/**'
출력: dispatch-group controller/DTO/service, lifecycle IT, desktop API 계약 테스트, DispatchGroupPage/CarrierListPage, mock handler, Playwright spec 참조 확인.

명령: rg -n "UUID|carrierId|groupId|\{id\}|\{carrierId\}" services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatchgroup services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatchgroup services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatchgroup clients/desktop/src/renderer/api/dispatchGroupApi.ts clients/desktop/src/renderer/routes/DispatchGroupPage.tsx clients/desktop/src/renderer/routes/CarrierListPage.tsx
출력: 공개 controller 경로/DTO/FE 계약에는 UUID 지목 키가 없고, service 내부 UUID 조인·전표 참조만 남음. controller annotation은 {groupNo}/{carrierCode}/{code}로 정렬.
```

### 3. 영향 테스트

```text
명령: ./gradlew :services:slip-service:compileJava --no-daemon
출력: BUILD SUCCESSFUL in 12s

명령: ./gradlew :services:slip-service:compileTestJava --no-daemon
출력: BUILD SUCCESSFUL in 15s

명령: ./gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.dispatchgroup.DispatchGroupDomainTest' --tests 'com.samhanair.logis.slip.web.GlobalExceptionHandlerTest' --no-daemon
출력: BUILD SUCCESSFUL in 10s

명령: ./gradlew :services:slip-service:test --tests 'com.samhanair.logis.slip.it.dispatchgroup.DispatchGroupLifecycleIT' --no-daemon
출력: BUILD SUCCESSFUL in 31s (Spring context/Testcontainers IT 2 tests)

명령: npm run typecheck
출력: Exit code 0; real-QA 하위 node test 2건 + 50건 pass

명령: npm exec vitest run (clients/desktop)
출력: Exit code 0; 전체 vitest pass, 최초 산출물 부재 실패는 npm run build 후 재실행에서 해소

명령: npx playwright test playwright/1039-s3-dispatch-group-mock.spec.ts --project=chromium
출력: 2 passed (4.5s)
```

## ⑥ 변경 파일

### 신규

- `docs/dev-reports/2026-08-04-1039-s3b-identifier-alignment.md`

### 수정

- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatchgroup/{DispatchGroup,Carrier,DispatchGroupSlip}.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatchgroup/{DispatchGroupRequests,CarrierRequests}.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/dispatchgroup/{DispatchGroupRepository,CarrierRepository}.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatchgroup/{DispatchGroupService,CarrierService}.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatchgroup/{DispatchGroupAdminController,CarrierAdminController}.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/dispatchgroup/DispatchGroupLifecycleIT.java`
- `clients/desktop/src/renderer/api/{dispatchGroupApi,dispatchGroupApi.contract.test,mock}.ts`
- `clients/desktop/src/renderer/routes/{DispatchGroupPage,CarrierListPage}.tsx`

### 신규

- `services/slip-service/src/main/resources/db/migration/V105__add_dispatch_group_versions.sql`
