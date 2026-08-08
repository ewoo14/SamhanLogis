# PR #1119 / Issue #1113 — S23 공통 seed toggle 배선·종료코드 전수표

## 판정

S23에서 지적된 5건을 수정했다.

- 공통 `SAMHAN_SEED_TEST_DATA`를 표준 seed template와 local-all compose의 product/inventory 양 서비스에 배선했다.
- 현재 deterministic product PK가 soft-deleted 상태인 경우 product 재기동이나 toggle 재실행만으로는 자동 복구할 수 없음을 fail-fast 메시지에 명시했다. 실행 불가능한 복구 절차는 안내하지 않는다.
- `launch-local-stack.ps1`, `stop-local-stack.ps1`, `stop-local-full.ps1`이 각 native 명령의 종료코드를 즉시 저장·판정하도록 수정했다.
- `/balances` 404와 끊긴 product 참조 100건은 판정에서 제외했다.

## A-1. 표준 실행 경로 배선표

| 표준 실행 경로 | 실제 전달 지점 | product | inventory | 판정 |
|---|---|---:|---:|---|
| `infrastructure/scripts/start-local-full.ps1` → `.env.dev-seed` | `infrastructure/env-templates/.env.dev-seed:61` | `true` | `true` | 배선됨 |
| `docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml up` | `infrastructure/docker-compose.local-all.yml:195` | `SAMHAN_SEED_TEST_DATA` 전달 | — | 배선됨 |
| 같은 compose의 inventory service | `infrastructure/docker-compose.local-all.yml:223` | — | `SAMHAN_SEED_TEST_DATA` 전달 | 배선됨 |
| Spring property 소비 | `services/product-service/src/main/resources/application.yml:58`, `services/inventory-service/src/main/resources/application.yml:51` | `app.seed-test-data` | `app.seed-test-data` | 기존 소비 경로 유지 |

`start-local-full.ps1`은 template를 process environment에 로드하고, compose overlay는 그 process environment를 각 container environment로 전달한다. 두 서비스의 실제 mutation seeder 5개는 모두 `app.seed-test-data=true`를 사용한다.

## A-2. fail-fast 안내의 현재 실행 가능성

현재 deterministic PK가 soft-deleted 행으로 남아 있으면 활성 lookup은 0건이고, 같은 PK를 다시 INSERT하는 product seeder도 PK 충돌을 행별 skip한다. 따라서 product service 재기동 또는 공통 toggle 재실행은 현재 상태에서 자동 복구 조치가 아니다.

`ProductSeedIntegrityValidator`는 이제 다음만 안내한다.

> 현재 deterministic product PK가 soft-deleted 행으로 남아 있을 수 있어 product-service 재기동 또는 공통 seed toggle 재실행만으로는 자동 복구할 수 없습니다. soft-delete 행 처리 정책이 결정·적용될 때까지 재고 seed를 재시도하지 마십시오.

즉, 지금 실행 가능한 자동 선행 조치가 없다는 사실과 blocker를 그대로 알리고, 존재하지 않는 복구 경로를 지시하지 않는다. 기존 `stock_balances`는 변경하지 않는다.

## B. `git ls-files -- '*.ps1'` 전건 표

실행 결과는 `COUNT=65`였다. 아래 표의 대상 목록은 해당 명령의 전건이며, `판정 출력`은 사람에게 성공/실패/완료를 알리는 최종 또는 명시적 결과 출력 여부다. 단순 진행 로그·스크린샷 파일 생성 로그는 판정 출력으로 세지 않았다. `종료코드 판정 대상 아님`은 native 명령의 결과를 사람 판정으로 수렴시키는 스크립트가 아니거나 helper/library인 경우다.

| 파일:줄 | 판정을 출력하는가 | 종료코드가 판정과 일치하는가 | 이번에 고치는가 | 아니면 왜 |
|---|---|---|---|---|
| `clients/desktop/scripts/generate-approval-render-goldens.ps1:9` | 아니오 | 해당 없음 | 아니오 | 렌더 goldens 생성 |
| `infrastructure/scripts/operational-validation.ps1:961-963` | 예 | 예 | 아니오 | 기존 native 결과 판정 유지 |
| `infrastructure/scripts/phase11-deploy.ps1:427-438` | 예 | 예 | 아니오 | 기존 배포 가드 유지 |
| `infrastructure/scripts/setup-minio-buckets.ps1:232-266` | 예 | 예 | 아니오 | 기존 bucket 단계 판정 유지 |
| `infrastructure/scripts/start-local-full.ps1:505-565` | 예 | 예 | 아니오 | 기존 start 단계 가드 유지; 이번 seed wiring은 template/compose |
| `infrastructure/scripts/stop-local-full.ps1:122-145` | 예 | 예 | 예 | down exit 저장·실패 throw 추가 |
| `infrastructure/scripts/validate-config-audit.ps1:238-334` | 예 | 해당 없음 | 아니오 | native 종료코드 기반 판정 대상 아님 |
| `infrastructure/scripts/verify-prometheus-rules.ps1:182-207` | 예 | 예 | 아니오 | 기존 rule 검증 가드 유지 |
| `scripts/check-local-stack-port-literals.ps1:25-54` | 예 | 예 | 아니오 | 기존 guard exit 유지 |
| `scripts/cleanup-loadtest-data.ps1:20-159` | 예 | 예 | 아니오 | 기존 cleanup 가드 유지 |
| `scripts/generate-arologis-d-ax-14-screenshots.ps1:166-168` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-arologis-dispatch-pages-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-arologis-qa-screenshots.ps1:654-661` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-d-ax-12-mobile-cross-import-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-13-auth-contract-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-17-arologis-mobile-photos-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-20-arologis-admin-photo-audit-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-d-ax-21-business-code-standardization-screenshots.ps1:94` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-d-ax-22-uuid-free-contract-hardening-screenshots.ps1:93` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-samhan-dispatch-board-screenshots.ps1:809-812` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-samhan-dispatch-modification-screenshots.ps1:809-812` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-samhan-signature-copy-screenshots.ps1:717-720` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-01-partner-ui-menu-gap-screenshots.ps1:104` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-02-accounting-closing-menu-gap-screenshots.ps1:242-245` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-03-purchase-inspection-cta-screenshots.ps1:276-279` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-04-full-menu-audit-screenshots.ps1:143` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-2-dps-history-screenshots.ps1:222` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1:118` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1:161` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1:182` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1:190-202` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-4-1-partner-order-list-detail-screenshots.ps1:179` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-4-2-partner-order-edit-put-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-sp-08-4-3-order-delete-and-estimate-convert-screenshots.ps1:—` | 아니오 | 해당 없음 | 아니오 | 결과 판정 출력 없음 |
| `scripts/generate-sp-08-4-4-order-print-form-screenshots.ps1:166-169` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-5-1-purchase-slip-list-detail-screenshots.ps1:218` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-5-2-purchase-slip-edit-put-screenshots.ps1:184` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-5-3-purchase-slip-soft-delete-screenshots.ps1:324` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-5-4-purchase-inspection-cta-regression-screenshots.ps1:282` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-5-5-purchase-print-form-screenshots.ps1:479` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-6-1-sales-slip-list-detail-screenshots.ps1:246` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-6-2-sales-slip-edit-put-screenshots.ps1:130` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/generate-sp-08-6-4-sales-print-form-screenshots.ps1:500-510` | 아니오 | 해당 없음 | 아니오 | 스크린샷 생성 |
| `scripts/launch-local-stack.ps1:136-147` | 예 | 예 | 예 | bootJar exit 저장·실패 throw 추가 |
| `scripts/lib/local-stack-port.ps1:52-117` | 예 | 예 | 아니오 | port resolver helper |
| `scripts/lib/qa-credentials.ps1:27` | 예 | 해당 없음 | 아니오 | credential resolver helper |
| `scripts/lib/qa-shots-dir.ps1:87-311` | 예 | 해당 없음 | 아니오 | QA path helper |
| `scripts/loadtest-metrics-snapshot.ps1:108` | 예 | 예 | 아니오 | 기존 snapshot 가드 유지 |
| `scripts/probe-896-s2-fresh-postgres.ps1:24-96` | 예 | 예 | 아니오 | throw 기반 probe 유지 |
| `scripts/regen-sp-08-5-2-shot2.ps1:102` | 아니오 | 해당 없음 | 아니오 | 단일 산출물 재생성 |
| `scripts/run-load-test.ps1:119-247` | 예 | 예 | 아니오 | 기존 load-test exit 가드 유지 |
| `scripts/seed-local-stack.ps1:167-188` | 예 | 예 | 아니오 | 기존 seed 단계 판정 유지 |
| `scripts/setup-codex-mcp-timeout.ps1:43-121` | 예 | 예 | 아니오 | 기존 setup 가드 유지 |
| `scripts/setup-codex-plugin.ps1:32-106` | 예 | 예 | 아니오 | 기존 plugin setup 가드 유지 |
| `scripts/stop-local-stack.ps1:45-64` | 예 | 예 | 예 | down exit 저장·실패 throw 추가 |
| `scripts/sync-claude-memory.ps1:26-54` | 예 | 예 | 아니오 | 기존 sync 가드 유지 |
| `tools/operational-validation/import-notion-csv.ps1:425-432` | 예 | 예 | 아니오 | 기존 import 가드 유지 |
| `tools/operational-validation/run-smoke-tests.ps1:230-342` | 예 | 예 | 아니오 | 기존 smoke 가드 유지 |
| `tools/operational-validation/smoke-test-helpers.ps1:—` | 아니오 | 해당 없음 | 아니오 | helper 함수만 제공 |
| `tools/operational-validation/test-s7-axis-redefined.ps1:155-177` | 예 | 예 | 아니오 | 기존 test 가드 유지 |
| `tools/test-data/seed-9-slice-fixtures.ps1:422-436` | 예 | 예 | 아니오 | fixture seed 가드 유지 |

핵심 누락은 stop 계열이었다. `stopped`/`종료 완료`라는 문구가 있는지만 본 것이 아니라, `docker compose down` 직후 `$LASTEXITCODE`를 저장하고 그 값과 최종 판정을 대조했다. 이번 표에서 세 대상은 모두 실패 시 throw하여 비0가 되도록 고쳤다.

## 검증

검증은 공유 Docker stack을 재기동·중지하지 않았고, DB 직접 쓰기 및 재시드를 하지 않았다.

1. RED — 수정 전 `node --test scripts/lib/s23-toggle-exitcode-contract.test.cjs`: 5 tests, 5 failures.
2. GREEN — 수정 후 같은 명령: 5 tests, 5 passes, 0 failures.
3. PowerShell 5.1 parser: 변경한 3개 `.ps1` 모두 `parse OK`.
4. 격리 native-command 양방향 probe(파이프 없음):

   ```text
   LAUNCH_NORMAL_EXIT=0
   LAUNCH_BUILD_FAIL_EXIT=1
   STOP_NORMAL_EXIT=0
   STOP_DOWN_FAIL_EXIT=1
   ```

   `stop-*` 스크립트 자체는 사용자 지시대로 실행하지 않았다.
5. `./gradlew.bat :services:inventory-service:test --tests 'com.samhanair.logis.inventory.seed.ProductSeedIntegrityValidatorTest' --no-daemon --console=plain`: `BUILD SUCCESSFUL`, exit 0.
6. 기존 재고 200행 수량 보존: DB를 변경하지 않았으며, 이번 변경은 seed toggle 전달·메시지·종료코드 가드뿐이다.

## 변경 규모·신규 파일

`git diff --stat` 기준 tracked 변경은 `26 insertions(+), 9 deletions(-)`이다. 삭제 줄 수는 **9줄**이다.

신규 파일:

- `docs/dev-reports/2026-08-08-1113-s23-toggle-wiring-and-exitcode-table.md`
- `scripts/lib/s23-toggle-exitcode-contract.test.cjs`

커밋·push는 하지 않았다.
