# S3 배차 그룹 UI 구현 보고서

## 1. 작업 시작 상태

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 저장소 루트: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- 시작 HEAD: `0780b4c388a6eb2cda8df9094c010f3d5e27df7b`
- 범위: `clients/desktop` S3 운송사 목록·배차 그룹 UI 및 필요한 프런트 계약/mock/권한 동기화
- 금지 범위: `clients/arologis-desktop`, 가배차 판정 규칙, 기존 S1/S2 백엔드 계약, Docker 조작, `git add`/commit/push

## 2. 화면 배치 결정

운송사 목록은 독립 route `/admin/carriers`, 배차 그룹은 독립 route `/admin/dispatch-groups`로 배치했다. 가배차 화면에는 배차 그룹 진입 링크를 추가했다. 독립 화면이면 그룹을 URL로 재진입할 수 있고 구매전표 검색을 가배차 결과와 분리할 수 있으며, 기존 가배차 판정 화면의 책임을 훼손하지 않는다.

전송은 승인에 따라 S4로 이관했다. 이번 라운드에는 전송 버튼/API를 만들지 않고 `transfer_status`만 읽기 전용으로 표시한다.

## 3. 구매전표 데이터 확인

실행 SQL 원문:

```sql
SELECT COUNT(*) AS active_inbound_slip_count FROM slips WHERE slip_type = 'INBOUND' AND is_deleted = FALSE;
```

실행 결과 원문:

```text
46
```

활성 INBOUND 46건이 확인됐다. 구매전표 검색 UI는 기존 `/admin/slips/search?q&limit&slipType=INBOUND`를 사용하며 가배차 결과와 분리했다.

## 4. 구현 및 검증 로그

- `/admin/carriers` 운송사 목록 화면과 `/admin/dispatch-groups` 배차 그룹 목록/생성 화면을 추가했다.
- `/arologis/pre-classify`에 배차 그룹 진입 링크를 추가하고 인사/배차 카테고리에 메뉴를 추가했다.
- `dispatchGroupApi.ts`, API 계약 테스트, mock handler를 추가했다. 전송 mutation은 의도적으로 export하지 않았다.
- 구매전표 검색은 `slipType=INBOUND`로 별도 조회한다. S1 응답에는 그룹 UUID가 없고 mutation path는 UUID를 요구하므로, UUID를 추측하지 않고 편입 mutation은 다음 계약 보완 후 활성화하도록 사유를 표시했다.
- `hr.carriers` 3층 동기화: FE `PageCode` union·PermissionMatrix catalog·mock 권한 catalog, BE `PageCode.HR_CARRIERS`, auth-service V91 권한 seed, S1 `CarrierAdminController`의 `@RequirePermission(page = "hr.carriers")`를 맞췄다.
- auth-service enum/catalog 추가는 사용자의 “프런트 키·백엔드 가드·catalog 전부” 요구를 충족하기 위한 추가 변경이며 기존 S1 API 계약은 바꾸지 않았다.

### 종료조건 ① 새 조합 열거

실행한 조합:

| 조합 | 결과 |
|---|---|
| 운송사 목록 진입·아로로지스/타 운송사·정산 연결 상태 표시 | Playwright mock 1/1 통과 |
| 지정일 배차 그룹 목록·`NOT_SENT` 읽기 전용 표시 | Playwright mock 1/1 통과 |
| 전송 버튼 부재 | Playwright에서 전송 role button count 0 확인 |
| 활성 INBOUND 검색 가능성 | SQL count 46 확인, 검색 UI 추가 |

미실행/보류 조합:

- 운송사 미지정 그룹에서 전표 편입, 비활성 운송사 지정, 이미 전송된 그룹 수정, 전표 포함 그룹 삭제는 S1 응답의 mutation용 UUID 부재로 UI mutation을 활성화하지 않았다.
- 위 조합은 다음 작업에서 S1 응답에 사용자 비공개 내부 식별자를 전달하거나 업무번호 기반 endpoint를 추가한 뒤 이유 표시와 함께 검증해야 한다.

### 종료조건 ② 참조 전수

명령:

```powershell
rg -n --glob '!**/node_modules/**' --glob '!**/build/**' --glob '!docs/qa/**' '(/admin/carriers|/admin/dispatch-groups|hr\.carriers|dispatchGroupApi|transferStatus)' clients/desktop services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java services/auth-service/src/main/resources/db/migration/V91__seed_hr_carriers_page_permission.sql
```

결과: 신규 route/API/권한 코드가 `clients/desktop`, BE enum, auth migration에서 확인됐다. `dispatchGroupApi`에는 `transfer` 함수가 없고 mock에도 전송 handler가 없다.

계약 테스트 원문:

```text
Test Files 3 passed
Tests 133 passed
```

금지 범위 조사에서는 기존 `sp-08-3-*` parity 스펙이 `clients/arologis-desktop` 문자열을 검사 대상으로 포함하는 것만 발견됐다. 해당 스펙과 `clients/arologis-desktop` 자체는 수정하지 않았다.

### 종료조건 ③ 영향 테스트

```powershell
npm run typecheck
```

```text
Exit code: 0
tsc -p tsconfig.node.json --noEmit: 통과
tsc -p tsconfig.web.json --noEmit: 통과
real-QA scope tests: 2 passed, 0 failed
```

```powershell
npx vitest run src/renderer/api/dispatchGroupApi.contract.test.ts src/renderer/api/mock.test.ts src/renderer/routes/permissionPageCatalog.parity.test.ts
```

```text
Test Files 3 passed
Tests 133 passed
```

```powershell
npx playwright test playwright/1039-s3-dispatch-group-mock.spec.ts --reporter=line
```

```text
Running 2 tests using 1 worker
2 passed
```

```powershell
git diff --check
```

```text
출력 없음
```

## 5. 추가 API 및 권한 동기화

- 추가한 프런트 API client: `/admin/carriers` CRUD, `/admin/dispatch-groups` 목록/생성 및 S1 mutation 함수 타입. 실제 화면은 식별자 계약이 보완될 때까지 목록/생성/검색에 한정했다.
- 기존 API 계약은 변경하지 않았다.
- `hr.carriers`: FE 키, FE catalog/mock, BE enum, S1 controller guard, auth V91 migration을 동기화했다.
- S4 전송 API/UI는 추가하지 않았다.

## 6. 변경 파일

### 기존 파일 수정

- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/api/permissionsApi.ts`
- `clients/desktop/src/renderer/components/AppLayout.tsx`
- `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx`
- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- `clients/desktop/src/renderer/routes/index.tsx`
- `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`

### 신규 파일

- `clients/desktop/playwright/1039-s3-dispatch-group-mock.spec.ts`
- `clients/desktop/src/renderer/api/dispatchGroupApi.ts`
- `clients/desktop/src/renderer/api/dispatchGroupApi.contract.test.ts`
- `clients/desktop/src/renderer/routes/CarrierListPage.tsx`
- `clients/desktop/src/renderer/routes/DispatchGroupPage.tsx`
- `services/auth-service/src/main/resources/db/migration/V91__seed_hr_carriers_page_permission.sql`
- `docs/superpowers/specs/2026-08-04-1039-s3-dispatch-group-ui-design.md`
- `docs/superpowers/plans/2026-08-04-1039-s3-dispatch-group-ui.md`
- `docs/dev-reports/2026-08-04-1039-s3-dispatch-group-ui.md`

커밋·push는 수행하지 않았다.
