# PR #1119 / Issue #1113 — S13 resolver·종료코드 축 fix

## 판정

결함 1과 resolver 포트 결함은 수정했다. 종료코드 축의 지정 3개도 수정했다. 커밋과 push는 하지 않았다.

| 축 | 결과 |
|---|---|
| 운영검증 CSV 항목 4 진입 | PASS — PS 5.1에서 끝까지 실행, `PASS 23 / FAIL 0 / SKIP 7`, exit 0, 보고서 생성 |
| resolver 전수 | PASS — 실행 중 16개 서비스의 resolver 출력이 Docker publish와 일치 |
| `start-local-full.ps1` 정상 | PASS — 15/15 health UP, 완료 출력, exit 0 |
| smoke 포트 축 | PASS — 15/15 health UP, slip `18086`, partner-order `18088` 사용 |
| smoke 전체 | BLOCK 유지 — `/inventory/balances` 업무 404로 `OK 7/8`, exit 1. 사용자가 다음 라운드로 분리한 결함이며 수정하지 않음 |
| seed `-SkipReimport` 전체 | 미완료 — 현재 스택의 기존 QA 로그인 요청이 400으로 실패. 포트 health 14개는 통과했으며, 인증/업무 seed 결함은 이번 수정 범위 밖 |

## 결함 1 — UTF-16 운영검증 CSV 배열

`infrastructure/scripts/operational-validation.ps1`의 네 `Join-Path` 표현식을 각각 괄호로 감쌌다. 파일은 UTF-16 LE BOM(`FF FE`)을 유지했다.

PS 5.1 동일 실행 형태의 결과:

```text
--- 항목 4: 4 CSV import ---
[SKIP] 4-1 ...
...
점검 완료 — PASS: 23  FAIL: 0  SKIP: 7
OPERATIONAL_EXIT=0 REPORT_EXISTS=True
```

## 결함 2 — 실행 중 Docker publish resolver

`scripts/lib/local-stack-port.ps1`이 실행 중 `samhan-*` 컨테이너의 `docker port` 결과를 직접 읽는다. 컨테이너가 없을 때만 기존 환경변수와 기본값으로 폴백한다. smoke의 `default + 100` 추측 probe는 제거했다. Eureka의 실제 컨테이너명 `samhan-eureka`도 명시했다.

### RED-A — resolver 출력과 Docker publish 전수 대조

| 서비스 | resolver | Docker publish(host → container) | 판정 |
|---|---:|---:|---|
| eureka-server | 8761 | 8761 → 8761 | PASS |
| api-gateway | 8080 | 8080 → 8080 | PASS |
| auth-service | 8081 | 8081 → 8081 | PASS |
| user-service | 8083 | 8083 → 8083 | PASS |
| product-service | 8084 | 8084 → 8084 | PASS |
| inventory-service | 8085 | 8085 → 8085 | PASS |
| slip-service | 18086 | 18086 → 8086 | PASS |
| accounting-service | 8087 | 8087 → 8087 | PASS |
| partner-order-service | 18088 | 18088 → 8088 | PASS |
| dc-config-service | 8089 | 8089 → 8089 | PASS |
| partner-auth-service | 8091 | 8091 → 8091 | PASS |
| groupware-service | 8092 | 8092 → 8092 | PASS |
| notification-service | 8093 | 8093 → 8093 | PASS |
| dashboard-service | 8094 | 8094 → 8094 | PASS |
| partner-service | 8095 | 8095 → 8095 | PASS |
| arologis-service | 8097 | 8097 → 8097 | PASS |

`start-local-full.ps1`의 중복 환경변수 override 루프도 제거했다. 그 루프가 resolver 결과 `18086`을 `.env.dev-seed`의 `8186`으로 다시 덮어쓰던 소비자 회귀를 전수 대조에서 발견했기 때문이다.

## 결함 3 — 종료코드 축

| 파일 | 성공 조건 | 실패 조건 | 수정 |
|---|---|---|---|
| `infrastructure/scripts/start-local-full.ps1` | health summary 전부 UP → 완료 출력, exit 0 | 하나라도 DOWN → DOWN 목록, 완료 출력 없음, exit 1 | `failedHealth` 집계 및 exit 가드 |
| `scripts/launch-local-stack.ps1` | compose up exit 0 후 readiness 통과 → 기존 정상 종료 | compose up 직후 exit 비0 → 즉시 throw, 후속 probe가 덮어쓰지 않음 | `$LASTEXITCODE` 즉시 저장/검사 |
| `tools/test-data/seed-9-slice-fixtures.ps1` | WARN 0건 → 완료 출력, exit 0 | WARN 1건 이상 → 실패 출력, 완료 출력 없음, exit 1 | `SeedFailureCount` 누적 및 완료 전 가드 |
| `tools/operational-validation/test-s7-axis-redefined.ps1` | S7 정상 + 실행 중 resolver publish 일치 → exit 0 | mutation/불일치 assertion → 비0 | 실행 중 Docker publish 계약에 맞춰 회귀 단정 보강 |

실측:

```text
start-local-full.ps1 -SkipDocker -SkipServices -SkipPortCheck
15/15 UP · 완료 · exit 0

기존 스택에서 slip health를 resolver 이전 포트로 강제한 실패 조건
health DOWN: slip-service (port 8186) · exit 1

test-s7-axis-redefined.ps1
S7 axis regression tests passed. · exit 0
```

## tracked `.ps1` 전수 sweep

판정 문구가 없는 생성기/헬퍼는 종료 판정 대상이 아니므로 `없음`으로 표시했다. 판정 문구가 있는 파일은 성공/실패 출력과 종료 경로를 확인했으며, 이번 라운드에서 실제 수정한 파일은 `*`로 표시했다.

| 파일 | 사람 판정 출력 | 종료코드 축 상태 |
|---|---|---|
| `clients/desktop/scripts/generate-approval-render-goldens.ps1` | 없음 | 해당 없음 |
| `infrastructure/scripts/operational-validation.ps1` | PASS/FAIL/SKIP | PASS/FAIL 집계 후 종료 |
| `infrastructure/scripts/phase11-deploy.ps1` | PASS/FAIL | 실패 누적/비0 |
| `infrastructure/scripts/setup-minio-buckets.ps1` | 완료/경고 | 기존 종료 경로 |
| `infrastructure/scripts/start-local-full.ps1` * | 완료/DOWN | 수정 완료 |
| `infrastructure/scripts/stop-local-full.ps1` | 중지 안내 | 판정 없음 |
| `infrastructure/scripts/validate-config-audit.ps1` | PASS/FAIL | 실패 throw |
| `infrastructure/scripts/verify-prometheus-rules.ps1` | PASS/FAIL | 실패 throw |
| `scripts/check-local-stack-port-literals.ps1` | passed/fail | 비0 전파 |
| `scripts/cleanup-loadtest-data.ps1` | 완료/경고 | 기존 종료 경로 |
| `scripts/generate-arologis-d-ax-14-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-arologis-dispatch-pages-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-arologis-qa-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-d-ax-12-mobile-cross-import-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-13-auth-contract-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-17-arologis-mobile-photos-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-20-arologis-admin-photo-audit-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-d-ax-21-business-code-standardization-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-d-ax-22-uuid-free-contract-hardening-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-samhan-dispatch-board-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-samhan-dispatch-modification-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-samhan-signature-copy-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-01-partner-ui-menu-gap-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-02-accounting-closing-menu-gap-screenshots.ps1` | PASS/FAIL | 실패 throw |
| `scripts/generate-sp-03-purchase-inspection-cta-screenshots.ps1` | PASS/FAIL | 실패 throw |
| `scripts/generate-sp-04-full-menu-audit-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-08-2-dps-history-screenshots.ps1` | PASS/FAIL | 실패 throw |
| `scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1` | PASS/FAIL | 실패 throw |
| `scripts/generate-sp-08-4-1-partner-order-list-detail-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-4-2-partner-order-edit-put-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-4-3-order-delete-and-estimate-convert-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-4-4-order-print-form-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-08-5-1-purchase-slip-list-detail-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-5-2-purchase-slip-edit-put-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-5-3-purchase-slip-soft-delete-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-08-5-4-purchase-inspection-cta-regression-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-08-5-5-purchase-print-form-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-6-1-sales-slip-list-detail-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/generate-sp-08-6-2-sales-slip-edit-put-screenshots.ps1` | 완료 | 산출 생성기 |
| `scripts/generate-sp-08-6-4-sales-print-form-screenshots.ps1` | 없음 | 산출 생성기 |
| `scripts/launch-local-stack.ps1` * | URL/단계 완료 | 수정 완료 |
| `scripts/lib/local-stack-port.ps1` * | throw only | resolver 오류 비0 |
| `scripts/lib/qa-credentials.ps1` | throw only | 자격 오류 비0 |
| `scripts/lib/qa-shots-dir.ps1` | 경고/경로 | 기존 종료 경로 |
| `scripts/loadtest-metrics-snapshot.ps1` | 없음 | 산출 생성기 |
| `scripts/probe-896-s2-fresh-postgres.ps1` | PASS/FAIL | 실패 throw |
| `scripts/regen-sp-08-5-2-shot2.ps1` | 없음 | 산출 생성기 |
| `scripts/run-load-test.ps1` | 완료/실패 | 기존 종료 경로 |
| `scripts/seed-local-stack.ps1` | 완료/실패 | 인증 실패 exit 1 |
| `scripts/setup-codex-mcp-timeout.ps1` | 완료/실패 | 실패 throw |
| `scripts/setup-codex-plugin.ps1` | 완료/실패 | 실패 throw |
| `scripts/stop-local-stack.ps1` | 없음 | 중지 도구 |
| `scripts/sync-claude-memory.ps1` | 없음 | 실패 throw |
| `tools/operational-validation/import-notion-csv.ps1` | PASS/FAIL | 실패 비0 |
| `tools/operational-validation/run-smoke-tests.ps1` * | UP/OK/불합격 | 포트 축 PASS, 업무 404로 비0 |
| `tools/operational-validation/smoke-test-helpers.ps1` | helper 반환 | 호출자 판정 |
| `tools/operational-validation/test-s7-axis-redefined.ps1` * | passed/fail | assertion 비0 |
| `tools/test-data/seed-9-slice-fixtures.ps1` * | 완료/실패 | 수정 완료 |

## 범위 제외 및 상태

- BOM 누락 2건과 port literal guard `-Root` 기준점은 수정하지 않았다.
- inventory `/balances` 업무 404는 다음 라운드로 유지했다.
- `git diff --stat` 기준 삭제 줄 수: **47** (UTF-16 운영검증 파일은 binary diff로 표시되어 별도 line count 없음).
- 신규 파일: 이 보고서 1개. 기존 SOL 보고서와 기존 QA raw 로그는 수정/삭제하지 않았다.
