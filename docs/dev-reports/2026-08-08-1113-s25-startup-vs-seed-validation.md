# PR #1119 / Issue #1113 — S25 startup vs seed validation

## 판정

**GREEN — 신규 결함 1건을 수정했다.**

표준 `.env.dev-seed`에서 product/inventory 공통 toggle을 `false`로 되돌려 현재 DB의 soft-deleted product 100건이 inventory-service 기동을 막지 않게 했다. 시드를 명시적으로 실행할 때는 `start-local-full.ps1 -RunSeed`가 같은 공통 toggle을 `true`로 주입한다.

따라서 다음 두 불변식을 동시에 유지한다.

- 표준 서비스 기동은 seed 정합성과 무관하게 진행된다.
- 실제 시드 실행에서는 `ProductSeedIntegrityValidator`가 활성 product 참조를 검사하고, 누락 시 시드를 fail-fast 중단한다.

## 원인과 수정

S24에서 확인된 흐름은 다음과 같았다.

1. 표준 템플릿이 `SAMHAN_SEED_TEST_DATA=true`를 로드했다.
2. inventory의 `StockBalanceSeeder`가 `CommandLineRunner`로 실행됐다.
3. validator가 soft-deleted product 100건의 활성 참조 누락을 발견하고 예외를 던졌다.
4. CommandLineRunner 예외가 inventory-service 기동 실패로 전파됐다.

validator나 seed 정합성 검증을 제거하지 않았다. 표준 템플릿의 공통 toggle만 `false`로 변경하고, 명시적 seed 실행 경로인 `-RunSeed`를 `start-local-full.ps1`에 추가했다. compose의 product/inventory toggle 배선과 validator의 fail-fast 안내는 보존했다.

## RED → GREEN

S25 계약 테스트에서 표준 template 값이 `false`이고 `-RunSeed`가 명시적으로 `true`를 주입해야 한다는 기대를 먼저 추가했다. 수정 전에는 template 기대값과 `-RunSeed` 경로가 없어 테스트가 실패했다.

수정 후 검증:

| 검증 | 결과 |
|---|---|
| Windows PowerShell 5.1 parser (`start-local-full.ps1`) | parse errors 0 |
| `./gradlew.bat :services:inventory-service:test --tests '*ProductSeedIntegrityValidatorTest'` | BUILD SUCCESSFUL |
| `node --test scripts/lib/s23-toggle-exitcode-contract.test.cjs` | 6/6 pass |
| `git diff --check` | exit 0 |

공유 Docker stack 기동/중지, DB 직접 쓰기, 재시드는 수행하지 않았다.

## RED-A / RED-B / RED-C

- **RED-A:** 표준 template이 false이므로 seed CommandLineRunner가 표준 기동에서 생성되지 않는다. inventory-service가 soft-deleted product 상태 때문에 차단되지 않는 구조로 바뀌었다.
- **RED-B:** `-RunSeed`로 실제 seed 실행 시 기존 validator가 활성 product 누락을 예외로 중단한다. 검증 제거 또는 경고 전환은 하지 않았다.
- **RED-C:** compose 양쪽의 공통 toggle 배선, fail-fast 안내, S22 종료코드 3건 계약 테스트는 그대로 유지되며 6/6 통과했다.

## 변경 파일

- `infrastructure/env-templates/.env.dev-seed`
- `infrastructure/scripts/start-local-full.ps1`
- `scripts/lib/s23-toggle-exitcode-contract.test.cjs`
- `docs/dev-reports/2026-08-08-1113-s25-startup-vs-seed-validation.md` (신규)

## diff stat

검증 시점 `git diff --stat`:

```text
 infrastructure/env-templates/.env.dev-seed        | 12 +++++++-----
 infrastructure/scripts/start-local-full.ps1       | 14 +++++++++++++-
 scripts/lib/s23-toggle-exitcode-contract.test.cjs | 12 +++++++++++-
 3 files changed, 31 insertions(+), 7 deletions(-)
```

삭제 줄 수는 **7줄**이다. 보고서 파일은 아직 untracked 신규 파일이며, 커밋과 push는 하지 않았다.

