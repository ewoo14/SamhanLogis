# PR #1145 R9 — 권한 가드 비대칭 및 실 DB 차이 동결

## 판정

회계 page-code 정합 범위는 R7의 exact 검사(초과·누락 0)를 유지했다. V99은 변경하지 않았고, mock의 340비트도 고치지 않았다. 실 DB는 `samhan-postgres/auth_db`에 SELECT만 실행했다.

## ① 양방향 가드와 mutation 증거

검사기는 mock page-code 카탈로그 ↔ 스냅샷 page-code 집합, mock 역할 정규식 ↔ 스냅샷 역할 집합을 양방향 exact 비교한다. 기존 R8의 역할×page×7-action 전수 검사도 유지한다.

R8 mutation을 임시 테스트에서 직접 재현한 원문:

```text
R9_MUTATION_RAW mock-only page code: mock ↔ snapshot page-code catalog: expected [ …(2) ] to deeply equal [ 'accounting.sales-slip.accounting' ]
R9_MUTATION_RAW snapshot-only page code: mock ↔ snapshot page-code catalog: expected [ 'accounting.sales-slip.accounting' ] to deeply equal [ …(2) ]
R9_MUTATION_RAW mock-only role: mock ↔ snapshot role catalog: expected [ 'AUDITOR', 'MASTER' ] to deeply equal [ 'MASTER' ]
R9_MUTATION_RAW snapshot-only role: mock ↔ snapshot role catalog: expected [ 'MASTER' ] to deeply equal [ 'AUDITOR', 'MASTER' ]
```

네 임시 mutation 파일을 삭제한 뒤 baseline을 다시 실행했다. 원복 증명은 아래 최종 테스트 결과다.

```text
Test Files 1 passed (1)
Tests 8 passed (8)
```

## ② DB 파생 스냅샷과 exact 동결

체크인 산출물은 `accounting-slip-permission-db-snapshot.ts`다. `auth_db.role_page_permission_templates`의 `is_deleted=false` 행을 11역할×122 page-code 범위로 투영하며, DB 행 부재는 `0000000`으로 표현한다. 이 산출물은 mock 정본이 아니라 2026-08-09 실 DB SELECT 결과다.

mock과 DB 파생 스냅샷의 차이 항목은 `permission-mock-divergences.ts`에 `{ role, pageCode, snapshotBits, mockBits }`만 정렬해 저장했다. 사유·옳고 그름은 적지 않았다. 실행 시 현재 계산 집합과 체크인 목록을 `toEqual`로 비교하므로, 하나 늘거나 줄어도 실패한다.

현재 목록은 354셀이다.

- 존재 행의 7-bit 불일치 340셀
- 스냅샷 비0인데 DB 행이 없는 14셀

340비트는 mock에서 수정하지 않았다. DB 파생 스냅샷과 mock의 차이를 허용하는 유일한 경계가 체크인 목록이며, 목록 자체가 exact oracle이다.

갱신 명령:

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\t1144
.\scripts\refresh-accounting-permission-db-snapshot.ps1
cd clients\desktop
npx vitest run src/renderer/test-utils/accounting-slip-permission-contract.test.ts
```

갱신 계약:

1. 실 DB를 읽을 수 있는 시점에만 갱신한다.
2. DB 파생 파일과 divergence 목록은 같은 변경으로 검토한다.
3. 테스트에서 차이 집합이 바뀌면 목록을 함께 갱신해야 하며, 줄어드는 경우도 통과시키지 않는다.
4. V99 SQL은 갱신 대상이 아니며, 실 DB에는 쓰기 SQL을 실행하지 않는다.

DB 부재 시 동작:

`docker`가 없거나 컨테이너가 없거나 SELECT 실패·빈 결과이면 갱신 명령이 즉시 오류로 종료된다. 체크인된 이전 산출물로 조용히 대체하지 않는다. CI 테스트는 체크인 산출물을 사용해 실행할 수 있지만, DB 파생 산출물을 새로 만들거나 최신이라고 주장할 수는 없다. 따라서 DB 부재는 false green이 아니라 갱신 차단으로 보고된다.

## ③ 기존 검사 및 신호

R7 회계 exact 검사와 R8 전수 검사 모두 유지했다. 새 동작에 맞추기 위해 기존 테스트의 빨간색을 숨기지 않았으며, 최종 baseline에서는 동결 목록을 통해 알려진 차이만 명시적으로 허용한다.

## 실행 시간

| 명령 | 결과 | 시간 |
|---|---:|---:|
| 실 DB read-only projection SELECT | 11역할×122 범위 산출 | 약 0.6초 |
| mutation probe | 4/4 RED 원문 확인 | 약 0.6초 |
| 지정 Vitest | 8/8 통과 | 3.5초 |

로컬 Playwright는 요청대로 실행하지 않았다. design-system `dist/index.js` 부재로 timeout하는 환경이며 원격 CI가 권위다.

## 신규 파일 경로

- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts`
- `clients/desktop/src/renderer/test-utils/permission-mock-divergences.ts`
- `scripts/refresh-accounting-permission-db-snapshot.ps1`
- `docs/dev-reports/2026-08-09-1145-r9-divergence-freeze.md`
