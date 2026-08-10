# PR #1119 / Issue #1113 — S19 선재 3건 수정 및 진단

## 범위

개발책임자 결정에 따라 seed 자격 결함과 k6 부하 하네스 결함은 이 라운드에서 수정했다. inventory `/balances` 404는 DB를 변경하지 않고 원인 진단만 수행했다.

## 1. seed QA 자격 400 — 수정

`scripts/seed-local-stack.ps1`은 `QA_DEV_DEFAULT_PASSWORD`를 기존 공용 PowerShell 자격 로더로 해석한다. 표준 환경변수와 `infrastructure/.env.local`을 모두 찾지 못하면 로더가 키 이름과 파일 경로를 포함한 오류를 내고 종료하므로, 빈 `password`를 `/login`으로 전송하지 않는다. 자격 값 자체는 이 보고서와 로그에 기록하지 않았다.

정상 경로는 기존 로그인·JWT claim·등록·검증 흐름을 그대로 사용한다. 서버 계약과 자격 값은 변경하지 않았다.

## 2. k6 `http_req_failed` — 수정

원인은 직원 세션이 `POST /api/v1/partner-orders/drafts`를 호출하면서 임의 `X-Partner-Code`를 붙인 것이었다. 이 API는 partner JWT claim에서 게이트웨이가 주입한 partner identity를 요구하므로 직원 JWT 호출은 정상적으로 401이 된다.

직원 부하 flow에서는 partner-order mutation을 제거하고 직원 주체에 맞는 견적/전표 쓰기만 수행하도록 했다. `WRITE_MODE=partner-order`를 명시하면 하네스가 임의로 다른 주체로 대체하지 않고 즉시 오류를 낸다.

또한 401 응답에 대한 재귀 재로그인/재호출을 제거했다. 이제 한 논리 요청의 인증 실패가 k6 `http_req_failed`에 두 번 집계되지 않는다. 임계값은 완화하지 않았다.

## 3. inventory `/balances` 업무 404 — 진단만

공유 DB에 대해 SELECT만 실행했다. INSERT/UPDATE/DELETE와 재시드는 수행하지 않았다.

관찰 결과:

| 확인 항목 | 결과 |
|---|---:|
| 활성 `stock_balances` 행 | 201 |
| 활성 재고가 참조하는 distinct product UUID | 101 |
| 활성 product 행 | 3,083 |
| 양쪽에 동시에 존재하는 product UUID | 1 |
| product DB에 없는 재고 참조 UUID | 100 |
| 재고행 `created_by=system` | 200 (2026-05-31 생성) |
| product 활성행 주요 생성 시기 | 2026-07-28~2026-08-03 |

재고 시더는 `samhan-seed:product:<modelName>` 결정적 UUID를 100개 모델 × 2 창고로 기록하도록 작성돼 있다. 현재 product DB에는 그 결정적 UUID가 활성/삭제 행 모두에 존재하지 않고, 동일 모델명도 확인되지 않았다. 따라서 현재 증거는 “재고 시더가 참조를 먼저 만들었고 이후 product 카탈로그가 다른 데이터 세트로 교체/재시드된 상태”와 일치한다. 삭제인지, 애초 product 시드 미실행인지, 다른 DB를 가리킨 것인지는 현재 SELECT 증거만으로 확정할 수 없다.

### 개발책임자 확정 필요 선택지

1. product와 inventory의 공통 결정적 seed를 같은 릴리스/기동 계약으로 재실행한다.
2. migration으로 기존 재고 참조를 현재 product master에 매핑한다. 매핑 불가 행의 보존/제외 정책이 필요하다.
3. 끊긴 재고 행을 soft-delete 또는 별도 orphan 정책으로 처리한다. 업무 조회 계약과 수량 보존 정책을 먼저 결정해야 한다.

현재 라운드에서는 위 선택지 중 어느 것도 실행하지 않았다.

## 검증 결과

- Windows PowerShell 5.1에서 `seed-local-stack.ps1`와 `qa-credentials.ps1` 파싱이 PASS했다.
- `node --check perf/k6/mixed-load.js`가 PASS했다.
- 기존 `node --test scripts/lib/qa-credentials.test.cjs` 6/6 PASS했다. 누락 자격의 fail-fast 경로와 `.env.local` fallback을 포함한다.
- 빈 password fallback 정적 가드와 `git diff --check`가 PASS했다.
- 공유 Docker stack은 재기동하지 않았다. SELECT 진단 후 기존 stack의 slip `18086`, partner-order `18088` 상태를 보존했다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1113-s19-preexisting-three-fix.md`

## diff stat 삭제 줄 수

`git diff --stat` 기준 삭제 줄 수는 **15줄**이다(추가 10줄, 삭제 15줄; 신규 보고서 파일은 미추적 상태라 stat에 포함되지 않음).
