# PR #1172 머지 전 라이브QA

- 일자: 2026-08-12
- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\w1068`
- 사용자 지정 HEAD: `00280c767`
- 범위: 판매전표 신규/편집 헤더 자동채움, 전잔/후잔 표시, 판매전표 목록·상세 일치
- 금지 준수: git 명령 미사용, 공유 `samhan-*` 스택 미조작, 구현 코드 미변경

## 측정 1 — 격리 실행 사전조건

결과:

- `infrastructure/.env.local`: 존재 (`True`)
- rebase 이전 실화면 QA 산출물과 격리 실행 이력 확인
- 직전 격리 구성: PostgreSQL 컨테이너 `sol-1068-review2-pg`, host port `55434`; partner/slip/accounting DB를 격리 사용
- 직전 서비스 포트 `15176`, `18481`, `18486`, `18487`, `18495`, `19172`는 종료 확인 기록이 있으므로 이번 라운드에서는 현재 HEAD 소스로 다시 기동해야 함
- 직전 화면 증거는 rebase 이전이므로 이번 머지 게이트 증거로 재사용하지 않음

실행 원문:

```powershell
Write-Output ('ENV_LOCAL=' + (Test-Path -LiteralPath 'infrastructure\\.env.local'))
Get-ChildItem -LiteralPath 'docs\\qa' -Directory | Where-Object { $_.Name -match '1172|1068|slip' } | Select-Object -ExpandProperty FullName
```

출력 원문:

```text
ENV_LOCAL=True
C:\dev\Samhan-Public\.claude\worktrees\w1068\docs\qa\2026-08-11-1068-real-qa
C:\dev\Samhan-Public\.claude\worktrees\w1068\docs\qa\2026-08-12-1068-fix3-real-qa
C:\dev\Samhan-Public\.claude\worktrees\w1068\docs\qa\2026-08-12-1068-fix4-real-qa
C:\dev\Samhan-Public\.claude\worktrees\w1068\docs\qa\2026-08-12-1068-review2-real-qa
C:\dev\Samhan-Public\.claude\worktrees\w1068\docs\qa\2026-08-12-1068-sol-review-real-qa
```

직전 보고서에서 확인한 격리 원문:

```text
격리 PostgreSQL 컨테이너는 sol-1068-review2-pg, host port는 55434였다.
partner: jdbc:postgresql://127.0.0.1:55434/partner_db
slip: jdbc:postgresql://127.0.0.1:55434/slip_db
accounting: jdbc:postgresql://127.0.0.1:55434/accounting_db
종료 때 15176, 18481, 18486, 18487, 18495, 19172 포트 모두 listener 없음.
```

## 측정 2 — 대화형 브라우저 가용성

결과:

- Codex 인앱/확장 브라우저 목록: 빈 배열 (`[]`)
- 브라우저 플러그인 직접 제어는 불가
- 이번 라운드는 저장소의 공식 `clients/desktop/playwright.real-qa.config.ts`와 로컬 Chromium을 사용해 실제 격리 서비스 UI를 실행하는 경로로 진행

실행 원문:

```javascript
if (globalThis.agent?.browsers == null) {
  const { setupBrowserRuntime } = await import("C:/Users/user/.codex/plugins/cache/openai-bundled/browser/26.803.61601/scripts/browser-client.mjs");
  globalThis.agent = await setupBrowserRuntime();
}
if (globalThis.browser == null) {
  globalThis.browser = await agent.browsers.getDefault();
  nodeRepl.write(await browser.documentation());
}
```

출력 원문:

```text
No browser is available
```

복구 절차 확인 후 실행 원문:

```javascript
nodeRepl.write(await agent.browsers.list());
```

출력 원문:

```text
[]
```

## 측정 3 — 현재 HEAD 서비스 배포본 생성

결과: `BUILD SUCCESSFUL`, 31개 task 전부 실행. 기존 JAR를 재사용하지 않고 현재 워크트리에서 핵심 3개 서비스를 fresh `bootJar`로 생성했다.

실행 원문:

```powershell
.\gradlew.bat :services:accounting-service:bootJar :services:partner-service:bootJar :services:slip-service:bootJar --no-daemon --rerun-tasks --no-build-cache --no-parallel --console=plain
Get-FileHash -Algorithm SHA256 'services\accounting-service\build\libs\accounting-service.jar','services\partner-service\build\libs\partner-service.jar','services\slip-service\build\libs\slip-service.jar'
```

출력 원문:

```text
> Task :services:accounting-service:bootJar
> Task :services:partner-service:bootJar
> Task :services:slip-service:bootJar

BUILD SUCCESSFUL in 1m 11s
31 actionable tasks: 31 executed
C:\dev\Samhan-Public\.claude\worktrees\w1068\services\accounting-service\build\libs\accounting-service.jar D073E67C886605981FA146B03C1AA48A271EB5D67DA56749A8B625CBD04A8E43
C:\dev\Samhan-Public\.claude\worktrees\w1068\services\partner-service\build\libs\partner-service.jar 964741EA5DD85D47C403FDCA0754603A055B6BE49C43A4AD2B4041EF70F57839
C:\dev\Samhan-Public\.claude\worktrees\w1068\services\slip-service\build\libs\slip-service.jar 439C24714F75FDA04E658AA18680C985969CE78C332AC3BD38640A8D728860BD
```

## 측정 4 — #1172 전용 격리 스택

결과:

- 전용 Docker network: `qa1172pm-net`
- 전용 PostgreSQL: `qa1172pm-pg`, host `127.0.0.1:41732`
- 전용 API gateway: `127.0.0.1:41780`
- 현재 HEAD fresh 이미지:
  - `qa1172pm-accounting:00280c767` — `sha256:b86d4c1cbfeecb2aec432f5f1145a5f29d8711d4a6a7a25822002b66404fb8f6`
  - `qa1172pm-partner:00280c767` — `sha256:6eaf83cdd5a7ef0e223d6010edab6da567f28781673965cc768bb6bd5d2c9a97`
  - `qa1172pm-slip:00280c767` — `sha256:4bbabd86e3e59b0d24993bd2f8528b0153cfe0dc7b5db018079908c52bf3e96c`
- current source Vite renderer: `127.0.0.1:41775`, app version `2026/08/12-1172`
- auth/user/product/inventory/dc/dashboard/notification/partner/slip/accounting/gateway 전부 격리 DB·network에서 `UP`
- 공유 `samhan-*`와 다른 작업 `recon1175-*`에는 요청·로그인·쓰기 0건

실행 원문:

```powershell
docker network create qa1172pm-net
docker run -d --name qa1172pm-pg --network qa1172pm-net --network-alias postgres -p 127.0.0.1:41732:5432 -e POSTGRES_DB=postgres -e POSTGRES_USER=samhan -e POSTGRES_PASSWORD=samhan_dev_pw postgres:16-alpine
@('auth_db','user_db','product_db','inventory_db','dc_config_db','partner_db','slip_db','accounting_db') | ForEach-Object { docker exec qa1172pm-pg createdb -U samhan $_ }
```

출력 원문:

```text
/var/run/postgresql:5432 - no response
/var/run/postgresql:5432 - rejecting connections
/var/run/postgresql:5432 - accepting connections
accounting_db
auth_db
dc_config_db
inventory_db
partner_db
product_db
slip_db
user_db
```

최종 health 출력 원문:

```text
41785=UP 41794=UP 41793=UP
qa1172pm-notification  Up (healthy)
qa1172pm-dashboard     Up (healthy)
qa1172pm-gateway       Up (healthy)
qa1172pm-accounting    Up (healthy)
qa1172pm-slip          Up (healthy)
qa1172pm-partner       Up (healthy)
qa1172pm-dc            Up (healthy)
qa1172pm-inventory     Up (healthy)
qa1172pm-product       Up (healthy)
qa1172pm-user          Up (healthy)
qa1172pm-auth          Up (healthy)
qa1172pm-eureka        Up (healthy)
qa1172pm-rabbit        Up
qa1172pm-redis         Up
qa1172pm-pg            Up
```

## 측정 5 — 실제 화면 라이브QA

최종 판정: **PASS — 도달 가능한 기능 결함 0건.**

검증 내용:

1. 신규 판매전표에서 `P-2026-0001 / (주)서울에어컨` 선택
   - 전화번호 `02-1017-1041`
   - 주소 `서울특별시 강남구 테헤란로 101번길 2 경기도 화성시 동탄대로 201번길 2 (창고)`
   - 대표이사 `홍길동`
   - 마스터 DB/API 값과 화면 자동채움 일치
2. 신규 화면 전잔 `0원`, 후잔은 저장 전 계약 문구 `저장 후 산출`
   - 빈칸·`undefined`·`NaN` 없음
3. 판매전표 목록의 `2026/03/11 - 1 / 거래처-P-2026-0020`과 상세가 일치
   - 상세 전잔 `12,100,000원`, 후잔 `12,100,000원`
   - accounting API 원문 `12100000 / 12100000`과 화면 일치
4. R22 canonical 상태인 `DELIVERED` 전표 `2026/03/10-1` 추가 실화면 확인
   - 전잔 `26,400,000원`
   - 후잔 `47,975,400원`
   - accounting API 원문 `26400000 / 47975400`과 화면 일치
   - 전잔과 후잔이 실제 판매 금액만큼 달라져 canonical 판매 상태가 라이브 경로에 반영됨

첫 최종 실행 명령 원문:

```powershell
.\node_modules\.bin\playwright.cmd test --config=playwright.qa1172-premerge-live.config.ts --reporter=line
```

출력 원문:

```text
Running 1 test using 1 worker
[1/1] playwright\2026-08-12-1172-premerge-live\1172-premerge-live.spec.ts:53:1 › PR #1172 현재 HEAD 격리 실서비스 라이브QA
{"isolatedUi":"http://127.0.0.1:41775","isolatedApi":"http://127.0.0.1:41780","newPartner":"P-2026-0001","newOpeningText":"0원","newClosingText":"저장 후 산출","sampleSlipNo":"2026/03/11-1","sampleSlipPartner":"거래처-P-2026-0020","detailOpeningText":"12,100,000원","detailClosingText":"12,100,000원","ledgerOpeningBalance":12100000,"ledgerClosingBalance":12100000,"failedResponses":["404 GET http://127.0.0.1:41780/app/version?clientType=DESKTOP&currentVersion=2026%2F08%2F12-1172","404 GET http://127.0.0.1:41780/api/v1/partner-dc-configs/P-2026-0001","503 POST http://127.0.0.1:41780/logs/front"]}
1 passed (4.0s)
```

위 3개 응답은 대상 기능 밖의 격리 보조 경로다. `/app/version`은 격리 지원 이미지의 버전 endpoint 부재, partner DC config 404는 해당 거래처 개별 override 없음, `/logs/front`는 logging-service 미기동이다. 헤더·partner·slip·accounting 대상 호출은 모두 성공했다.

R22 canonical 추가 실행 명령 원문:

```powershell
.\node_modules\.bin\playwright.cmd test --config=playwright.qa1172-canonical.config.ts --reporter=line
```

출력 원문:

```text
Running 1 test using 1 worker
[1/1] playwright\2026-08-12-1172-canonical\1172-canonical.spec.ts:12:1 › R22 canonical DELIVERED 판매전표의 전잔·후잔 실화면
{"slipNo":"2026/03/10-1","status":"DELIVERED","opening":"26,400,000원","closing":"47,975,400원","apiOpening":26400000,"apiClosing":47975400}
1 passed (2.8s)
```

실행 중 발생한 사전 중단은 모두 QA harness 선택자/기대값 문제였고 제품 결함이 아니었다.

- 중복 헤딩 strict locator → 고유 `header-page-title` 사용
- 거래처 combobox accessible name → 실제 `거래처` 사용
- partner 주소 → DB `address1 + address2` API 계약으로 기대값 교정
- 목록 전표번호 → 화면 표기 규칙 `2026/03/11 - 1` 사용

## 스크린샷 산출물

1. `docs/qa/2026-08-12-1172-premerge-live/01-sales-new-before-partner.png`
2. `docs/qa/2026-08-12-1172-premerge-live/02-sales-new-autofill-and-balance.png`
3. `docs/qa/2026-08-12-1172-premerge-live/03-sales-new-autofill-zoom.png`
4. `docs/qa/2026-08-12-1172-premerge-live/04-sales-new-balance-zoom.png`
5. `docs/qa/2026-08-12-1172-premerge-live/05-sales-slip-list.png`
6. `docs/qa/2026-08-12-1172-premerge-live/06-sales-slip-list-row-zoom.png`
7. `docs/qa/2026-08-12-1172-premerge-live/07-sales-slip-detail.png`
8. `docs/qa/2026-08-12-1172-premerge-live/08-sales-slip-detail-balance-zoom.png`
9. `docs/qa/2026-08-12-1172-premerge-live/09-canonical-delivered-list-row-zoom.png`
10. `docs/qa/2026-08-12-1172-premerge-live/10-canonical-delivered-slip-detail.png`
11. `docs/qa/2026-08-12-1172-premerge-live/11-canonical-delivered-balance-zoom.png`

육안 검수: 한글 정상, 헤더 자동채움 값 식별 가능, 전잔·후잔 확대 컷 식별 가능, 목록·상세 전표번호 및 거래처 일치, `undefined`·`NaN` 노출 없음.

## 불변식에 대한 라이브QA 해석

- `CANONICAL_SALE_STATUSES` 직접 사용: `DELIVERED` 표본에서 전잔 `26,400,000원` → 후잔 `47,975,400원`으로 실경로 반영 확인.
- exact SLIP dedup, MANUAL·역분개 보존, `POSTED + REVERSED`, 회계일자+전표번호 정렬은 화면에서 내부 분기 자체를 분해해 볼 수 없는 산식 불변식이다. 이번 라운드는 현재 HEAD fresh accounting JAR의 라이브 API 결과와 화면값이 일치하는지 확인했으며, 내부 불변식의 적대검증 결과를 정적 게이트로 대체하거나 재실행한 것으로 과장하지 않는다.

## 측정 6 — 종료 정리 및 파일 시스템 검증

격리 QA 컨테이너 15개와 `qa1172pm-net`만 제거했다. 공유 `samhan-*` 스택은 사용하거나 변경하지 않았다.

정리 명령 원문:

```powershell
docker rm -f qa1172pm-notification qa1172pm-dashboard qa1172pm-gateway qa1172pm-accounting qa1172pm-slip qa1172pm-partner qa1172pm-dc qa1172pm-inventory qa1172pm-product qa1172pm-user qa1172pm-auth qa1172pm-eureka qa1172pm-rabbit qa1172pm-redis qa1172pm-pg; docker network rm qa1172pm-net
```

출력 원문:

```text
qa1172pm-notification
qa1172pm-dashboard
qa1172pm-gateway
qa1172pm-accounting
qa1172pm-slip
qa1172pm-partner
qa1172pm-dc
qa1172pm-inventory
qa1172pm-product
qa1172pm-user
qa1172pm-auth
qa1172pm-eureka
qa1172pm-rabbit
qa1172pm-redis
qa1172pm-pg
qa1172pm-net
```

최종 검증 명령 원문:

```powershell
$qa = 'docs/qa/2026-08-12-1172-premerge-live'
$expected = @('01-sales-new-before-partner.png','02-sales-new-autofill-and-balance.png','03-sales-new-autofill-zoom.png','04-sales-new-balance-zoom.png','05-sales-slip-list.png','06-sales-slip-list-row-zoom.png','07-sales-slip-detail.png','08-sales-slip-detail-balance-zoom.png','09-canonical-delivered-list-row-zoom.png','10-canonical-delivered-slip-detail.png','11-canonical-delivered-balance-zoom.png')
# 각 PNG 존재·비어 있지 않음·이미지 크기 확인
# 보고서와 tracked-writer 존재·크기·SHA-256 확인
# 임시 Playwright 파일 부재, 격리 컨테이너/네트워크/Vite listener 0 확인
```

출력 원문:

```text
docs\qa\2026-08-12-1172-premerge-live\01-sales-new-before-partner.png|134003 bytes|1440x1692
docs\qa\2026-08-12-1172-premerge-live\02-sales-new-autofill-and-balance.png|140741 bytes|1440x1692
docs\qa\2026-08-12-1172-premerge-live\03-sales-new-autofill-zoom.png|14853 bytes|1102x207
docs\qa\2026-08-12-1172-premerge-live\04-sales-new-balance-zoom.png|2841 bytes|1102x46
docs\qa\2026-08-12-1172-premerge-live\05-sales-slip-list.png|153929 bytes|1440x1062
docs\qa\2026-08-12-1172-premerge-live\06-sales-slip-list-row-zoom.png|5813 bytes|1150x41
docs\qa\2026-08-12-1172-premerge-live\07-sales-slip-detail.png|172638 bytes|1440x2157
docs\qa\2026-08-12-1172-premerge-live\08-sales-slip-detail-balance-zoom.png|4169 bytes|1152x119
docs\qa\2026-08-12-1172-premerge-live\09-canonical-delivered-list-row-zoom.png|6428 bytes|1150x40
docs\qa\2026-08-12-1172-premerge-live\10-canonical-delivered-slip-detail.png|159282 bytes|1440x2051
docs\qa\2026-08-12-1172-premerge-live\11-canonical-delivered-balance-zoom.png|4808 bytes|1152x119
REPORT|docs/dev-reports/2026-08-12-1172-premerge-live-qa.md|11596 bytes
TRACKED_WRITER|tools/.s24-build-only/build/deep/tracked-writer.mjs|42 bytes|SHA256=F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3
TEMP_ABSENT|clients/desktop/playwright.qa1172-premerge-live.config.ts|True
TEMP_ABSENT|clients/desktop/playwright/2026-08-12-1172-premerge-live/1172-premerge-live.spec.ts|True
TEMP_ABSENT|clients/desktop/playwright.qa1172-canonical.config.ts|True
TEMP_ABSENT|clients/desktop/playwright/2026-08-12-1172-canonical/1172-canonical.spec.ts|True
TEMP_ABSENT|clients/desktop/playwright.qa1172-clean.config.ts|True
TEMP_ABSENT|clients/desktop/playwright/2026-08-12-1172-clean/1172-clean.spec.ts|True
ISOLATED_CONTAINERS_REMAINING|0
ISOLATED_NETWORKS_REMAINING|0
VITE_41775_LISTENERS|0
```

파일 시스템 기준 기존 추적 파일 삭제 작업은 0건이다. 특히 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재하며 42 bytes, SHA-256 `F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3`이다. (`git` 명령은 사용하지 않았다.)

보고서 요구 표식 및 산출물 개수 재검증 출력 원문:

```text
REPORT_REQUIRED_MARKERS|18/18
PNG_COUNT|11
REPORT_SHA256|1886FB21CF3074A6B013252A28E9A5E5944E7C21EBC59EA1B6013720F60A588E
TRACKED_WRITER_EXISTS|True
FINAL_VERIFICATION|PASS
```
