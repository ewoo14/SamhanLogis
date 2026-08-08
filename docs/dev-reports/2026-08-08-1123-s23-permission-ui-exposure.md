# PR #1124 · 이슈 #1123 S23 권한설정 화면 노출 fix

## 결론

S23은 화면 노출 결함을 수정했다. desktop 권한설정 매트릭스에서 관리자가 다음 3개 런타임 PageCode를 계정별로 부여·회수할 수 있게 했다.

- `slip.closed-date-exception` — 마감일 예외 생성
- `slip.closed-date-admin` — 마감 기준선 관리
- `notification.dispatch-sms.send-audit` — 배차안내 SMS (회수됨)

S22에서 지목된 두 코드만이 아니라, BE 런타임 PageCode 전수와 desktop `PAGE_GROUPS` 전수를 grep/소스 추출로 대조했다. 기존 의도적 FE 제외인 `slip.period-lock`을 제외하면 누락은 위 3개였다.

MASTER seed/런타임 불일치는 이번 라운드에서 관측만 했고, MASTER 관련 파일은 변경하지 않았다.

## 결함 2 판정 — MASTER seed와 런타임의 불일치

업무 정책(마스터가 회계 마감을 넘을 수 있는가)은 코드만으로 확정할 수 없다. 따라서 이번 라운드에서 의도/버그를 단정하지 않고, seed와 런타임이 어긋난 사실만 보고한다.

관측 근거:

- `services/auth-service/src/main/resources/db/migration/V95__seed_slip_closed_date_exception_permission.sql:1-9`
  - 원문: `기본값은 MASTER/MANAGER만 허용하며...`
  - `role_page_permission_templates`에 `MASTER`, `MANAGER`와 `slip.closed-date-exception`의 VIEW/CREATE를 seed한다.
- `services/auth-service/src/main/resources/db/migration/V96__seed_slip_closed_date_admin_permission.sql:24-35`
  - `is_system_master = TRUE` 그룹에 속한 계정은 account enforcement materialization 대상에서 제외한다.
- `services/auth-service/src/main/java/com/samhanair/logis/auth/service/EffectivePermissionMaterializer.java:40-59`
  - 원문: `MASTER 시스템 그룹에 배속된 계정은 기존 MASTER bypass 를 유지하기 위해 account_page_permissions 활성 행을 만들지 않는다.`
  - system MASTER이면 행을 soft-delete한 뒤 즉시 반환한다.
- `services/auth-service/src/main/java/com/samhanair/logis/auth/service/AccountPermissionService.java:45-60`
  - `check()`는 `account_page_permissions` 행만 읽고, 행이 없으면 `false`를 반환한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuard.java:36-44`
  - 마감 날짜일 때 `slip.closed-date-exception` + `CREATE`를 검사하지만, MASTER를 명시적으로 제외/허용하는 코드는 없다.

따라서 코드로 확정 가능한 것은 **일반 MASTER bypass materialization 설계와 마감 예외 seed 선언이 충돌한다는 사실**까지다. “회계 마감에서는 MASTER도 예외 불가”라는 업무 의도는 명시되어 있지 않으므로 모른다고 판정한다. `V95`, `V96`, materializer, runtime check, guard 모두 변경하지 않았다.

## RED-A · RED-B · 동시 GREEN

### RED-A — 수정 전

- ① 관리자가 화면에서 `slip.closed-date-exception`을 부여·회수할 수 없음.
- ② BE PageCode 200개 중 화면 `PAGE_GROUPS`에 없는 코드가 4개였고, 기존 의도적 제외 `slip.period-lock`을 빼도 다음 3개가 누락됨.

### RED-B — 수정 전 관측 기준선

- ③ 기존 화면 행/권한 집합을 삭제·중복시키지 않음.
- ④ S22 실측 네 조합을 유지해야 함: `403 / 200·COMPLETED / 403 / 409`.

### 동시 GREEN — S23 수정 후

- ① `PermissionMatrixPage`의 기존 계정별 7-action 매트릭스에 3개 행이 포함되어 부여·회수가 가능함.
- ② BE 런타임 PageCode와 desktop 행 목록 차집합은 기존 의도적 제외 1개(`slip.period-lock`)만 남고, 허용된 차집합은 0개임.
- ③ 기존 행을 삭제하거나 중복 추가하지 않았다. parity 테스트가 그룹 목록 중복도 검사한다.
- ④ S22에서 이미 검증한 네 조합의 기대값은 코드/데이터를 건드리지 않아 유지된다. 이번 라운드에는 재배포·상태 전이·DB 조작을 하지 않았다.

## 런타임 권한 코드 ↔ 화면 목록 차집합

비교 기준:

- 런타임: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`의 enum 문자열 200개
- 화면: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`의 `PAGE_GROUPS` 199개
- `slip.period-lock`은 기존 `FRONTEND_REMOVED_BACKEND_PAGE_CODES` 정책상 화면 제외

| 구분 | page_code | 판정/조치 |
|---|---|---|
| 런타임에만 존재(수정 전) | `notification.dispatch-sms.send-audit` | 같은 배차 SMS 계열로 `배차` 그룹에 추가 |
| 런타임에만 존재(수정 전) | `slip.closed-date-admin` | 마감 기준선 관리 계열로 `전표 운영` 그룹에 추가 |
| 런타임에만 존재(수정 전) | `slip.closed-date-exception` | 마감 예외 계열로 `전표 운영` 그룹에 추가 |
| 런타임에만 존재(수정 후) | `slip.period-lock` | 기존 의도적 FE 제외 1개; 이번 fix 대상 아님 |
| 화면에만 존재 | 없음 | 차집합 0 |

수정 후 parity 테스트에서 BE 런타임 코드 중 허용 제외를 뺀 화면 누락 차집합은 `[]`이며, 화면 그룹 중복도 0건이다.

## ① 새로 가능해진 권한·화면 조합과 결과

이번 라운드의 화면 변경으로 아래 조합이 새로 가능해졌다. 모두 기존 매트릭스의 계정 선택 → 행 검색/선택 → 7-action 체크 → 저장 경로를 사용한다.

| 화면 그룹 | 행 | 가능한 조작 | 결과 |
|---|---|---|---|
| 전표 운영 | `slip.closed-date-exception` | VIEW/CREATE 등 계정별 부여·회수 | 화면 행으로 노출되며 기존 `updateAccountMatrix` 저장 경로 사용 |
| 전표 운영 | `slip.closed-date-admin` | VIEW/CREATE/UPDATE/DELETE 등 계정별 부여·회수 | 화면 행으로 노출되며 기존 저장 경로 사용 |
| 배차 | `notification.dispatch-sms.send-audit` | VIEW/CREATE 등 계정별 부여·회수 | 화면 행으로 노출되며 기존 저장 경로 사용 |

실 업무 권한 부여와 기존 전표 상태 전이는 하지 않았다. 따라서 S23 확인용 데이터는 생성하지 않았다.

## ② 전수 대조와 테스트

먼저 추가한 RED 테스트는 수정 전 다음 실패를 확인했다.

```text
BE 런타임 PageCode가 desktop 권한 행에서 누락되었습니다:
notification.dispatch-sms.send-audit, slip.closed-date-admin, slip.closed-date-exception
```

추가한 parity 검사는 다음을 보장한다.

- BE PageCode 대비 desktop `PAGE_GROUPS` 누락 검출
- 기존 허용 제외 `slip.period-lock` 외 차집합 0
- desktop 행 중복 0

## ③ 변경 파일을 참조하는 테스트

변경 파일을 직접 참조하는 desktop parity 테스트를 실행했다.

```text
npm test -- --run src/renderer/routes/permissionPageCatalog.parity.test.ts
✓ 1 test file
✓ 4 tests
```

변경 파일과 연관된 범위를 좁히지 않기 위해 desktop 전체 검증도 실행했다.

```text
npm test             exit 0
npm run typecheck    exit 0
```

전체 테스트 중 출력된 React Router future flag와 real-QA 로컬 파생물 안내는 기존 경고이며 실패가 아니었다.

추가 검증은 PM/CI에서 재배포 없이 수행한다. S23에서는 전체 Gradle suite, Docker 재기동, 재배포를 실행하지 않았다.

## 신규 확인용 데이터

없음. 이번 라운드에는 `S23-1123` 확인용 데이터 생성, DB 직접 INSERT/UPDATE/DELETE, 권한 실부여, 기존 전표 상태 전이를 모두 수행하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-1123-s23-permission-ui-exposure.md`

## 변경 파일 목록

- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
  - 누락된 3개 PageCode를 기존 `전표 운영`/`배차` 그룹에 추가
- `clients/desktop/src/renderer/routes/permissionPageCatalog.parity.test.ts`
  - 런타임↔화면 누락 및 화면 중복 회귀 테스트 추가
