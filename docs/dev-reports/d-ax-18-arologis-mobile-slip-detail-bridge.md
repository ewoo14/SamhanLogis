# D-AX-18 arologis-mobile slip detail bridge DevOps Verification Draft

> 작성일: 2026-05-16 KST
>
> spec: [`docs/superpowers/specs/2026-05-15-d-ax-18-arologis-mobile-slip-detail-bridge-design.md`](../superpowers/specs/2026-05-15-d-ax-18-arologis-mobile-slip-detail-bridge-design.md)
>
> plan: [`docs/superpowers/plans/2026-05-15-d-ax-18-arologis-mobile-slip-detail-bridge.md`](../superpowers/plans/2026-05-15-d-ax-18-arologis-mobile-slip-detail-bridge.md)

## 1. Scope

D-AX-18 은 `clients/arologis-mobile` 에 오늘 배차 정차 target 기반의 읽기 전용 전표 상세 화면을 연결한다.
DevOps/검증 가드의 기준은 다음 4개다.

- driver-facing 요청은 `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 만 사용한다.
- 화면/API 공개 응답/QA 캡처에는 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 을 노출하지 않는다.
- `arologis-service` 는 인증된 기사와 오늘 정차 target 을 검증한 뒤 내부에서 slip 상세를 조회한다.
- PR 본문은 최종 HEAD commit 에 pin 된 raw URL 스크린샷과 검증 명령 결과를 함께 포함한다.

## 2. Recommended Verification Commands

### 2.1 Backend targeted

```powershell
.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks
```

확인 포인트:

- `GET /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail`
- 정상 응답의 UUID-free read model
- `parsedKakaoSeq` mismatch 는 slip lookup 전 `400 INVALID_INPUT`
- slip 매핑 실패는 `422 SLIP_MAPPING_NOT_FOUND`
- slip-service 상세 조회 실패는 `502 SLIP_DETAIL_FETCH_FAILED`

### 2.2 Backend Docker/Testcontainers regression

```powershell
$env:DOCKER_HOST='tcp://localhost:2375'
docker info
.\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks
```

Windows Docker Desktop 가드:

- Docker Desktop Settings > General > `Expose daemon on tcp://localhost:2375 without TLS` 활성화 후 재시작한다.
- `tcp://localhost:2375` 는 인증이 없으므로 로컬 개발 PC 에서만 사용한다.
- Docker Server 29.x 계열에서 docker-java/Testcontainers fallback API 1.32 `/info` 가 거부되면 `$HOME\.docker-java.properties` 에 `api.version=1.41` 설정을 확인한다.
- Docker 미가용 skip 을 그대로 승인하지 말고, 위 TCP 2375 우회 후 한 번 더 실행한다. CI 의 Ubuntu runner 는 Docker 가용성을 workflow 에서 `docker version` / `docker ps` 로 확인한다.

### 2.3 Frontend targeted

```powershell
Push-Location clients\arologis-mobile
npm run typecheck
npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand
npx expo install --check
Pop-Location
```

확인 포인트:

- API path/query/header 계약
- empty target guard 시 API 호출 없음
- 성공 화면의 전표번호, 거래처, 주소, 창고, 품목, 합계 렌더
- 422 한국어 오류/배차 복귀 CTA, 502 한국어 오류/재시도 CTA 분리
- TypeScript 공개 타입에서 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 접근 차단

### 2.4 QA screenshot generation

```powershell
.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1
```

생성 기대 파일:

- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/01-slip-detail-target-contract.png`
- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/02-dashboard-slip-detail-button.png`
- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/03-slip-detail-empty-target-guard.png`
- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/04-slip-detail-header.png`
- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/05-slip-detail-lines-and-total.png`
- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/06-slip-detail-mapping-failure-422.png`
- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/07-slip-detail-fetch-failure-retry.png`
- `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/08-verification-matrix.png`

UUID 노출 가드:

```powershell
rg -n "slipId|downloadUrl|attachmentId|dispatchId|vehicleId|stopId" docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots qa/playwright/scripts/generate-d-ax-18-arologis-mobile-slip-detail-screenshots.mjs
```

주의: PNG binary 자체는 `rg` 가 DOM 텍스트를 검증하지 못한다. Playwright mock script 의 화면 텍스트와 별도 verification matrix 에 금지 field 가 없는지 함께 확인한다.

## 3. PR CI Checklist

PR 발행 직후 다음 순서로 모니터링한다.

```powershell
gh pr checks <PR_NUMBER>
gh pr checks <PR_NUMBER> --watch
```

필수 확인:

- `arologis CI / 백엔드 빌드 + 테스트 (arologis-service)` 통과
- `arologis CI / 모바일 prebuild (arologis-mobile)` 통과 또는 pre-existing graceful 경고만 존재
- `QA E2E (Playwright + Detox)` 는 `clients/**` 또는 `qa/**` 변경 시 실행된다. D-AX-18 screenshot generator 가 `qa/playwright/**` 를 건드리면 반드시 확인한다.
- root `CI` 는 `docs/**` 변경이 포함되면 paths-ignore 에 걸리지 않아 실행될 수 있다. D-AX-18 코드가 아로로지스 전용이어도 dev-report/QA docs 때문에 Samhan Public matrix 가 같이 돌 수 있으므로 실패를 본 PR 책임 범위와 기존 회귀로 분리한다.
- GitGuardian secret scan 이 뜨면 실제 secret 여부를 PM 가드로 판정한다. dev-only password, token placeholder, raw screenshot URL 외 실 자격증명은 PR 에 포함하지 않는다.
- Windows 커밋이면 push 전 `git update-index --chmod=+x gradlew` 를 한 번 확인한다.

PR 본문 체크리스트 초안:

```markdown
## 검증
- [ ] Backend targeted: `ArologisDriverAppControllerTest`
- [ ] Docker/Testcontainers: `:services:arologis-service:test :services:slip-service:test`
- [ ] Mobile typecheck: `clients/arologis-mobile npm run typecheck`
- [ ] Mobile Jest: `DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts`
- [ ] Expo dependency check: `npx expo install --check`
- [ ] QA screenshots: 8 PNG generated
- [ ] UUID non-exposure: forbidden field search + visual matrix
- [ ] GitHub checks: `gh pr checks --watch` green
```

## 4. Screenshot Raw URL Attachment Rule

PR 본문에는 상대경로가 아니라 최종 HEAD commit SHA 에 pin 된 raw URL 을 사용한다.

```powershell
$headSha = git rev-parse HEAD
$slug = "d-ax-18-arologis-mobile-slip-detail-bridge"
@(
  "01-slip-detail-target-contract.png",
  "02-dashboard-slip-detail-button.png",
  "03-slip-detail-empty-target-guard.png",
  "04-slip-detail-header.png",
  "05-slip-detail-lines-and-total.png",
  "06-slip-detail-mapping-failure-422.png",
  "07-slip-detail-fetch-failure-retry.png",
  "08-verification-matrix.png"
) | ForEach-Object {
  "https://raw.githubusercontent.com/ewoo14/SamhanLogis/$headSha/docs/qa/$slug/screenshots/$_"
}
```

PR 본문 예시:

```markdown
## QA 캡처
![전표 상세 target 계약](https://raw.githubusercontent.com/ewoo14/SamhanLogis/<head-sha>/docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/01-slip-detail-target-contract.png)
![전표 상세 헤더](https://raw.githubusercontent.com/ewoo14/SamhanLogis/<head-sha>/docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/04-slip-detail-header.png)
![검증 매트릭스](https://raw.githubusercontent.com/ewoo14/SamhanLogis/<head-sha>/docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/08-verification-matrix.png)
```

PR body 갱신 직후 raw URL reachable 을 확인한다.

```powershell
$headSha = gh pr view <PR_NUMBER> --json headRefOid --jq .headRefOid
$slug = "d-ax-18-arologis-mobile-slip-detail-bridge"
@(
  "01-slip-detail-target-contract.png",
  "02-dashboard-slip-detail-button.png",
  "03-slip-detail-empty-target-guard.png",
  "04-slip-detail-header.png",
  "05-slip-detail-lines-and-total.png",
  "06-slip-detail-mapping-failure-422.png",
  "07-slip-detail-fetch-failure-retry.png",
  "08-verification-matrix.png"
) | ForEach-Object {
  $url = "https://raw.githubusercontent.com/ewoo14/SamhanLogis/$headSha/docs/qa/$slug/screenshots/$_"
  try {
    $r = Invoke-WebRequest -Method Head -Uri $url -UseBasicParsing -ErrorAction Stop
    "$($r.StatusCode) $($r.Headers.'Content-Length')B $_"
  } catch {
    "FAIL $_"
  }
}
```

기준:

- 모든 PNG 가 `200` 이어야 한다.
- `Content-Length` 는 빈 placeholder 가 아닌지 확인한다. 10KB 미만이면 실제 캡처 산출물인지 재검토한다.
- 404 가 나오면 중간 commit SHA pin, push 누락, CDN propagation delay 를 확인한다. 추가 commit 후에는 PR 본문 raw URL 을 새 HEAD SHA 로 다시 pin 한다.

## 5. Risk Points

| 위험 | 확인/대응 |
|---|---|
| 내부 UUID 노출 | BE DTO, TS public type, 화면 copy, screenshot script 에서 금지 field 검색. 화면에는 `slipNo`, 거래처명, 카톡 순번, 창고명만 사용. |
| slip-service 실패 매핑 | 422 매핑 실패와 502 상세 조회 실패를 분리. 5xx 를 200 empty 로 삼키지 않는다. |
| Testcontainers local skip | Windows npipe skip 을 그대로 승인하지 않고 TCP 2375 우회 후 재실행. CI Ubuntu runner 결과를 최종 신뢰. |
| root CI 추가 실행 | docs/QA 파일이 포함되면 root `CI` matrix 도 실행될 수 있다. arologis 전용 변경이라도 실패 scope 를 분리해 triage. |
| Expo dependency drift | 신규 native dependency 가 없어도 `npx expo install --check` 는 필수. lockfile 변경 시 리뷰 범위에 포함. |
| raw URL 404 | 최종 HEAD SHA 로 pin 하고 HEAD 200 검증. 추가 commit 후 PR 본문 re-pin. |
| GitGuardian false positive | 실제 secret 은 즉시 제거. dev-only placeholder 는 기존 가드에 따라 false positive 판정하되, 새 secret-like 문자열 추가는 피한다. |

## 6. Verification Status

2026-05-16 Codex 로컬/순차 QA 기준 결과이다. PR 발행 이후에만 확정 가능한 raw URL/CI 항목은 PR 본문과 GitHub checks 에서 최종 확인한다.

| 항목 | 결과 | 비고 |
|---|---|---|
| Backend targeted | PASS | `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks` |
| Docker/Testcontainers | PASS | `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` |
| Mobile typecheck | PASS | `clients/arologis-mobile npm run typecheck` |
| Mobile Jest | PASS | `DriverSlipDetailScreen.test.tsx`, `arologisSlipDetail.test.ts` — 2 suites / 8 tests |
| Expo check | PASS | `npx expo install --check` — dependencies up to date |
| Screenshot generation | PASS | `.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1` — 8 PNG |
| Screenshot visible text guard | PASS | `slipId/downloadUrl/attachmentId/dispatchId/vehicleId/stopId` match 없음 |
| arologis-mobile import boundary | PASS | `clients/arologis-mobile/src` 에 `mobile-staff` 직접 import 없음 |
| raw URL HEAD 200 | PR 단계 | 최종 HEAD SHA pin 후 PR 본문 링크 검증 |
| `gh pr checks --watch` | PR 단계 | PR 발행 후 PM 재점검 |
