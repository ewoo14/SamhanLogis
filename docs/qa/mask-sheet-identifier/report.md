# 시트 식별자 평문 일괄 마스킹 보고서

- 작업일: 2026-08-17
- 기준: `origin/main` (`5460b1609`)
- 대상: `chore/mask-sheet-identifier` 워크트리만
- 원칙: 이 보고서에는 식별자 값 자체를 기록하지 않는다.

## ① 전수 탐색 표

`Google Sheets URL / Spreadsheet ID` 형태의 평문을 기준으로 저장소 전체를 검색했다. 아래는 원본 기준 `파일:줄` 전수 목록이다. ㉠은 문서·보고서·QA 산출물, ㉡은 테스트 fixture/검증 fixture, ㉢은 실행 코드·설정·실행 주석이다.

| 파일:줄 | 분류 |
|---|---|
| `.claude/memory/project_lookup_seed_source.md:10` | ㉠ |
| `clients/desktop/playwright/1095-r10-real-qa/1095-r10-first-task-real-qa.spec.ts:18` | ㉡ |
| `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts:172` | ㉡ |
| `clients/desktop/playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts:78` | ㉡ |
| `clients/web/estimate-app/test/calc-fidelity.test.js:67` | ㉡ |
| `docs/audit/gas-port-fidelity/java-formula-read-discrepancy-investigation.md:20` | ㉠ |
| `docs/dev-reports/1008-r9-snapshot/metadata.json:4,7` | ㉠ |
| `docs/dev-reports/2026-06-15-spec-aware-input.md:20` | ㉠ |
| `docs/dev-reports/2026-08-02-1008-r2-setname-modeltoken-parity.md:113` | ㉠ |
| `docs/dev-reports/2026-08-02-1008-r7-postfix-reconvergence.md:35,254` | ㉠ |
| `docs/dev-reports/2026-08-02-1008-r9-snapshot-baseline.md:11` | ㉠ |
| `docs/dev-reports/2026-08-03-874-r15-reconvergence.md:580` | ㉠ |
| `docs/dev-reports/2026-08-08-1144-accounting-spec-gap-survey.md:11` | ㉠ |
| `docs/dev-reports/2026-08-08-896-daily-closing-sheet-consumers.md:10,27,566,625,653,681,708` | ㉠ |
| `docs/dev-reports/2026-08-08-896-sheet-tab-inventory.md:5` | ㉠ |
| `docs/dev-reports/2026-08-09-1095-product-status.md:12` | ㉠ |
| `docs/dev-reports/2026-08-09-896-partner-master-recollect.md:9` | ㉠ |
| `docs/dev-reports/2026-08-11-gasv2-origin-rest.md:505,727` | ㉠ |
| `docs/dev-reports/896-gas-formula-agg/groups.json:1` | ㉠ |
| `docs/dev-reports/896-gas-formula-agg/items.json:1` | ㉠ |
| `docs/dev-reports/lookup-3table-sheet-sync.md:9` | ㉠ |
| `docs/dev-reports/migration-be-product-google-sheets-sync.md:13,135` | ㉠ |
| `docs/dev-reports/migration-fe-google-sheets-data-source.md:161,187` | ㉠ |
| `docs/dev-reports/sp-04-full-menu-legacy-gas-notion-audit.md:15,46` | ㉠ |
| `docs/dev-reports/sp-07-google-sheets-quote-order-e2e.md:9` | ㉠ |
| `docs/dev-reports/sp-08-8-credential-plaintext-guard.md:141` | ㉠ |
| `docs/handoff/DB-MIGRATION-RUNBOOK.md:122` | ㉠ |
| `docs/operational-validation/google-sheets-live-source-snapshot.md:4` | ㉠ |
| `docs/operational-validation/google-sheets-sa-validation.md:12,65` | ㉠ |
| `docs/operational-validation/google-sheets-source-validation.md:3` | ㉠ |
| `docs/qa/896-db-mode-output/00-metadata.json:8` | ㉠ |
| `docs/qa/896-legacy-output-baseline/00-metadata.json:8`, `capture-baseline.mjs:145` | ㉠ |
| `docs/qa/896-parity-run2/{db, sheet}/{run1, run2}/00-metadata.json:8` | ㉠ |
| `docs/qa/bundle-set-expansion-pr1/RESULTS.md:16`, `boot.log:54,55,56,58,59,61,62,64,65,67,68,70,76,77,78,80,84` | ㉠ |
| `docs/qa/bundle-set-expansion-pr1b-specs/RESULTS.md:16`, `boot-sync-fixed.log:5,14`, `boot-sync-idempotency.log:3,12`, `boot-sync-stale-jar-defect.log:3,16` | ㉠ |
| `docs/superpowers/specs/2026-06-08-lookup-3table-sheet-sync-spec.md:8` | ㉠ |
| `.claude/memory/project_daily_closing_purpose_dc_verification.md:38`, `project_sp_08_legacy_gas_parity.md:43` | ㉠ 부분 표기 |
| `docs/dev-reports/legacy-gas-reverify-2026-06-09.md:51`, `docs/qa/estimate-p0c/RESULTS.md:4`, `docs/qa/lookup-3table-sheet-sync/real-qa-evidence.md:3`, `docs/superpowers/specs/2026-06-18-formula-f3-option-defaults.md:26` | ㉠ 부분 표기 |
| `infrastructure/env-templates/product-service.env:20` | ㉢ |
| `services/product-service/src/main/resources/application.yml:79` | ㉢ |
| `services/partner-order-service/src/main/resources/application.yml:90,132` | ㉢ |
| `services/product-service/src/main/java/.../GoogleSheetsClient.java:125` | ㉢ (Javadoc 예시) |
| `services/product-service/src/main/java/.../ProductSheetSyncService.java:84`, `ProductLookupSheetSyncService.java:49` | ㉢ |
| `services/partner-order-service/src/main/java/.../ProductCatalogLookupClient.java:45`, `BootstrapService.java:119` | ㉢ |
| `clients/web/estimate-app/lib/code.js:129` | ㉢ |
| `tools/legacy-gas/일마감 프로그램/Code.js:8`, `종합견적서/Code.js:49`, `에어디자이너 전용 주문서 인식/Code.js:23`, `제이시스템 전용 주문서 인식/Code.js:23`, `거래처 발송 주문서/Code.js:71` | ㉢ |

추가 자격 형태(AWS access key, OpenAI key, JWT, Google API key, GitHub token, Slack token)를 저장소 전체에서 별도 검색했으며 새 평문은 확인하지 못했다.

## ② 마스킹한 것

- ㉠ 문서·개발보고서·감사자료·handoff·운영검증·QA 로그/metadata·메모리의 식별자를 `<SHEET_ID>`로 치환했다.
- ㉡ Jest fixture와 Playwright 계약 fixture의 평문을 `<SHEET_ID>`로 치환했다.
- 실 Google Sheets Playwright fixture는 `GOOGLE_SHEETS_SHEET_ID` 환경변수 주입을 사용하고, 미주입 시 명시적으로 실패하도록 했다.
- 변경 파일 수: 50개(+본 보고서).

## ③ 건드리지 않은 것과 이유

- ㉢ Spring `application.yml`, env template, 서비스 client, `estimate-app/lib/code.js`, legacy GAS 5개는 실행 시 실제 시트를 읽는 경로다.
- 기본값을 제거하면 product sync/bootstrap/legacy GAS가 시트 ID 없이 시작하거나 동기화하지 못할 가능성이 확인되었고, 이 트랙에서 IT를 깨뜨리지 않기 위해 보류했다.
- 해당 실행 표면은 이미 `GOOGLE_SHEETS_SHEET_ID`, `BOOTSTRAP_SHEET_ID`, `INTEGRATED_QUOTE_SHEET_ID` 등 환경변수 override를 제공하지만, 기본값 제거의 영향 범위 확인과 운영 주입 보장은 별도 트랙이 필요하다.
- QA `boot.log`는 바이너리 판정이 있었으므로 파일 인코딩은 보존하고 ASCII 식별자 바이트만 치환했다.

## ④ 테스트 결과

| 검증 | 결과 |
|---|---|
| `npm test -- --runInBand` (`clients/web/estimate-app`) | PASS — 20 suites, 356 tests |
| `gradlew.bat assemble --no-daemon` | PASS |
| `gradlew.bat test --no-daemon` | FAIL — 15 service test task. 다수 IT가 `GatewayAttestationMockMvcConfig`/`SecurityConfig`의 기존 환경변수 부재로 ApplicationContext 초기화 실패. 마스킹 변경 파일과 무관한 실패이며 자동 되돌림 대상 실행 코드 변경은 없음. |
| `bash scripts/check-credential-plaintext.sh` | 전체 스캔 300초 제한 초과로 완료하지 못함. `CREDENTIAL_GUARD_SCOPE=s2`도 Windows Git Bash 재귀 스캔이 120초 제한 초과. PASS/FAIL을 주장하지 않음. |
| `git diff --check` | PASS |

## ⑤ 가드 패턴 판단

현재 `scripts/check-credential-plaintext.sh`의 `1[A-Za-z0-9_-]{43,}`는 canonical Google Sheet ID를 탐지한다. 이번에 마스킹한 평문은 모두 이 형태에 해당했고, 별도 패턴 추가는 기존 hash/ID 오탐 및 전체 가드 실행시간을 늘릴 수 있어 하지 않았다. 다만 현재 가드는 시트 ID가 `1`로 시작하지 않는 변형, 줄바꿈된 URL, 일부 바이너리 QA 산출물까지 완전 보장하지 않으므로 별도 가드 개선 이슈로 남긴다.

## ⑥ 프로세스 회수

- 이번 작업에서 기동한 Gradle daemon: assemble/test 종료 시 자동 회수됨.
- 이번 작업에서 기동한 npm/Jest 프로세스: 테스트 종료 후 잔여 없음.
- 이번 작업에서 기동한 컨테이너: 0개. 기존 Docker 컨테이너 26개는 변경·중지하지 않음.
- 작업 종료 시 이번 작업 기동 프로세스 잔여: 0개.

커밋·push·git add·PR·이슈 생성은 수행하지 않았다.
