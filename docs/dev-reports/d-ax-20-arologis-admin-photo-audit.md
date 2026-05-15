# D-AX-20 arologis admin photo audit — DevOps / release report

> 작성일: 2026-05-16 KST
> 소유 파일: `docs/dev-reports/d-ax-20-arologis-admin-photo-audit.md`
> 범위: 아로로지스 admin 사진 감사 화면의 backend endpoint, gateway routing, CI/QA/release guard 를 DevOps 관점에서 정리한다.

---

## 1. 결론

D-AX-20 은 아로로지스 admin 이 배송/검수 사진 감사 현황을 조회하는 **read-only admin page** slice 다. 운영자가 사진 누락, 업로드 상태, 재업로드 필요 여부를 확인하는 조회 화면이며, 이 리포트 기준으로는 데이터 변경, 파일 삭제, 재업로드 mutation 을 포함하지 않는다.

DevOps 결론은 다음과 같다.

| 항목 | 판단 |
|---|---|
| Gateway path | `GET /api/v1/slips/admin/photo-audit` |
| Backend target | slip-service `GET /slips/admin/photo-audit` |
| Gateway route 변경 | 불필요. 기존 `slip-service-v1` route (`/api/v1/slips/**`, `StripPrefix=2`) 로 흡수 |
| Docker/Testcontainers | backend query endpoint 이므로 slip-service tests 필수, 가능하면 Docker/Testcontainers 회귀 권장 |
| Rollback / feature flag | 별도 feature flag 불필요. read-only admin page 이므로 배포 rollback 은 기존 app image 되돌림으로 충분 |
| 사용자 노출 가드 | 화면/API/스크린샷에 내부 UUID 노출 금지. 전표번호, 거래처명, 차량/기사명, 사진 유형, 상태만 사용 |

---

## 2. Endpoint / Gateway contract

### 2.1 External ingress

```text
GET /api/v1/slips/admin/photo-audit
```

Gateway 는 기존 `services/api-gateway/src/main/resources/application.yml` 의 `slip-service-v1` route 를 사용한다.

```yaml
- id: slip-service-v1
  uri: lb://slip-service
  predicates:
    - Path=/api/v1/slips/**
  filters:
    - StripPrefix=2
    - JwtAuthentication
```

따라서 외부 요청은 다음처럼 전달된다.

| 단계 | Path |
|---|---|
| Client / desktop admin | `/api/v1/slips/admin/photo-audit` |
| API Gateway after `StripPrefix=2` | `/slips/admin/photo-audit` |
| slip-service controller | `GET /slips/admin/photo-audit` |

신규 gateway route 는 만들지 않는다. `/api/v1/slips/**` 는 이미 `JwtAuthentication` 을 통과하므로 admin role check 는 slip-service controller/service layer 의 `MASTER` / `MANAGER` 등 역할 정책과 함께 검증한다.

### 2.2 Query behavior

구현 query 는 전표일자 범위와 첨부 유형, 전표번호 부분 검색으로 제한한다.

| 파라미터 | 용도 | 운영 가드 |
|---|---|---|
| `from`, `to` | 감사 대상 전표일 범위 | ISO date (`YYYY-MM-DD`) |
| `type` | `DELIVERY` / `INSPECTION` / `ESTIMATE` | enum validation |
| `slipNo` | 업무 식별 검색 | `YYYY/MM/DD-{순번}` 전표번호 부분 검색 |
| `page`, `size` | Spring Page | 기본 50, 최대 100 |

응답은 업무 식별자 중심으로 소비한다. 내부 `attachmentId`, `slipId`, `dispatchId`, `vehicleId`, `stopId`, `downloadUrl` 은 응답에 포함하지 않는다. object storage key, presigned/download URL 은 admin 화면에도 직접 노출하지 않는다. `uploadedBy` 가 UUID 패턴이면 BE DTO 생성 단계에서 `업로더 확인 필요`로 치환한다.

---

## 3. Docker / Testcontainers 판단

D-AX-20 은 backend query endpoint 가 핵심이므로 단순 frontend-only slice 로 취급하면 안 된다. slip-service 의 조회 조건, attachment join, audit 상태 계산이 DB row 와 맞물리기 때문에 backend unit/controller tests 는 필수다.

권장 검증:

```powershell
.\gradlew.bat :services:slip-service:test --tests "*PhotoAudit*" --no-daemon --rerun-tasks
.\gradlew.bat :services:slip-service:test --no-daemon --rerun-tasks
```

가능하면 Docker/Testcontainers 회귀까지 실행한다.

```powershell
$env:DOCKER_HOST='tcp://localhost:2375'
docker info
.\gradlew.bat :services:slip-service:test --no-daemon --rerun-tasks
```

판단 기준:

| 검증 | 필요성 |
|---|---|
| slip-service focused test | 필수. query endpoint 계약, role guard, UUID-free DTO 검증 |
| slip-service full test | 권장. attachment / dispatch / realtime 인접 회귀 확인 |
| Docker/Testcontainers | 가능하면 권장. PostgreSQL query, Flyway, repository join 이 실제 DB에서 깨지는지 확인 |
| 전체 docker-compose | 필수는 아님. endpoint 가 read-only query 이며 Redis/RabbitMQ/Elasticsearch/MinIO write path 를 새로 만들지 않음 |

Windows 로컬에서 Docker Desktop npipe 이 불안정하면 기존 가드대로 `DOCKER_HOST=tcp://localhost:2375` 우회를 먼저 시도한다. 로컬 Docker 가 불가하면 PR 본문에 사유를 적고 GitHub Actions Ubuntu runner 결과를 최종 신뢰한다.

---

## 4. CI expectations

PR 발행 후 기대되는 CI 는 다음과 같다.

| CI | 기대 |
|---|---|
| root `CI` / `slip-units` | slip-service 단위 + 빠른 client/domain/service test 통과 |
| root `CI` / slip IT groups | PR matrix 에 포함된 slip delivery/public/core 범위 통과 |
| Frontend Desktop | admin 화면 또는 API client 변경이 포함되면 typecheck/lint/build 통과 |
| QA E2E (Playwright + Detox) | QA script 또는 client 변경 시 실행. backend 미기동 skip 은 PR 본문에서 실제 screenshot 산출물로 보완 |
| GitGuardian | 신규 secret-like 문자열 금지. dev-only placeholder 도 가능하면 추가하지 않음 |

PR 생성 직후에는 기존 운영 규칙대로 확인한다.

```powershell
gh pr checks <PR_NUMBER>
gh pr checks <PR_NUMBER> --watch
```

CI fail 이 발생하면 본 slice 범위인지, 기존 slip-service 장기 IT backlog 인지 분리한다. D-AX-20 의 blocker 는 photo-audit endpoint, admin UI, UUID-free guard, screenshot asset, 관련 workflow 실패다.

---

## 4.1 2026-05-16 PM 로컬 검증 결과

부모 PM 통합 단계에서 Docker Desktop 은 npipe 권한 문제가 있어 `DOCKER_HOST=tcp://localhost:2375` 로 TCP daemon 접근을 확인했다. Gradle wrapper 신규 다운로드는 네트워크 제한으로 막혔기 때문에 host Gradle cache 를 Docker/JDK 컨테이너에 mount 하여 검증했다.

| 검증 | 명령/범위 | 결과 |
|---|---|---|
| Docker daemon | `DOCKER_HOST=tcp://localhost:2375 docker info` | PASS |
| QA screenshot generator | `scripts/generate-d-ax-20-arologis-admin-photo-audit-screenshots.ps1` | PASS — 7 PNG, privacy guard PASS |
| Desktop typecheck | `clients/desktop npm run typecheck` | PASS |
| Desktop lint | `clients/desktop npm run lint` | PASS — 기존 warning 3건, error 0 |
| Desktop build | `clients/desktop npm run build` | PASS |
| D-AX20 Playwright contract | `npx playwright test playwright/photo-audit/photo-audit.spec.ts --reporter=line` | PASS — 3 tests, skip 없음 |
| BE focused | Docker/JDK Gradle `:services:slip-service:test --tests "*PhotoAudit*"` | PASS — MVC security 4 tests + repository JPQL 1 test 포함 |
| BE full | Docker/JDK Gradle `:services:slip-service:test` | PASS — 461 tests, failure 0, error 0, 기존 IT skip 171 |
| D-AX20 Playwright gate | `clients/desktop` Playwright contract | 현재 CI-enforced 아님. 로컬 수동 hard gate 로 PR 본문에 명시 |

Docker/JDK 재현 명령:

```powershell
$env:DOCKER_HOST='tcp://localhost:2375'
docker run --rm `
  -e GRADLE_USER_HOME=/gradle-cache `
  -v C:\dev\SamhanLogis:/workspace `
  -v C:\Users\user\.gradle:/gradle-cache `
  -w /workspace `
  eclipse-temurin:17-jdk `
  /gradle-cache/wrapper/dists/gradle-8.10.2-bin/a04bxjujx95o3nb99gddekhwo/gradle-8.10.2/bin/gradle `
  :services:slip-service:test --no-daemon --rerun-tasks --offline
```

기존 slip-service full test 의 171 skip 은 D-AX20 신규 skip 이 아니라 기존 Testcontainers guard 에 의해 Docker provider 를 사용할 수 없을 때 스킵되는 IT 계열이다. 이번 세션에서 확인한 원인은 Linux test container 내부 raw TCP daemon 접근 자체가 아니라 Testcontainers `DockerClientProviderStrategy` 가 Docker Desktop remote TCP 환경을 valid provider 로 판정하지 못하는 문제다. 이는 후속 **no-skip hardening** PR 에서 `TESTCONTAINERS_HOST_OVERRIDE`, Docker Desktop TCP/provider 설정, CI Ubuntu runner 와 로컬 Windows 실행 경로를 분리해 해소한다.

현재 세션의 GitHub/remote 네트워크 호출은 제한되어 `gh pr list`, `gh run list` 조회가 실패했다. push/PR 생성 후 가능한 환경에서 `gh pr checks --watch` 와 raw screenshot URL `HEAD 200`을 재확인한다.

---

## 5. Screenshot raw HEAD 200 조건

PR 본문에는 QA 스크린샷을 상대경로나 branch floating URL 이 아니라 최종 HEAD SHA 에 pin 된 raw URL 로 첨부한다.

```powershell
$headSha = gh pr view <PR_NUMBER> --json headRefOid --jq .headRefOid
$slug = "d-ax-20-arologis-admin-photo-audit"
$files = @(
  "01-scope-contract.png",
  "02-filter-table.png",
  "03-thumbnail-no-url.png",
  "04-reupload-candidate-badge.png",
  "05-gps-audit-metadata.png",
  "06-verification-matrix.png",
  "07-pr-inline-capture-checklist.png"
)
$files | ForEach-Object {
  $url = "https://raw.githubusercontent.com/ewoo14/SamhanLogis/$headSha/docs/qa/$slug/screenshots/$_"
  $r = Invoke-WebRequest -Method Head -Uri $url -UseBasicParsing -ErrorAction Stop
  "$($r.StatusCode) $($r.Headers.'Content-Length')B $_"
}
```

승인 기준:

| 조건 | 기준 |
|---|---|
| HTTP status | 모든 PNG `HEAD 200` |
| Content-Length | 빈 placeholder 가 아닌 실제 이미지 크기 |
| SHA pin | PR 최종 HEAD SHA 기준. 추가 commit 후 PR 본문 raw URL 재고정 |
| 화면 내용 | 내부 UUID, storage key, presigned/download URL 미노출 |

`404` 는 push 누락, SHA pin 불일치, 경로 오타를 먼저 의심한다. `302` 또는 GitHub blob URL 은 PR 본문 인라인 이미지 기준으로 부적합하므로 raw.githubusercontent.com URL 로 교체한다.

---

## 6. No UUID / user-visible guard

아로로지스 admin 이라도 사용자 화면에는 내부 UUID 를 노출하지 않는다. 운영 식별은 업무 코드와 상태 값으로 충분해야 한다.

허용 표시:

- 전표번호 / 배송일 / 거래처명
- 차량번호 / 기사명 / 기사 전화번호 마스킹 값
- 사진 유형 `DELIVERY` / `INSPECTION`
- 사진 상태, 업로드 시각, 누락 사유
- 카톡 순번, 정차 순번 같은 업무상 공개 가능한 순번
- UUID 패턴이 아닌 업로더 표시명 또는 업무 코드

금지 표시:

- `slipId`, `attachmentId`, `dispatchId`, `vehicleId`, `stopId`
- raw UUID 문자열
- MinIO/S3 object key
- presigned URL, download URL
- 내부 token, batch token, internal token
- UUID 형태의 raw user-id 업로더 값

권장 guard:

```powershell
rg -n "slipId|attachmentId|dispatchId|vehicleId|stopId|downloadUrl|presigned|objectKey|storageKey|internalToken|batchToken" `
  services\slip-service clients\desktop docs\qa\d-ax-20-arologis-admin-photo-audit
```

검색 결과가 테스트 fixture, 내부 entity, repository 구현처럼 사용자 응답과 무관한 위치라면 PR 리뷰에서 예외 사유를 명시한다. DTO, renderer state, visible text, screenshot generator 에서 match 되면 blocker 로 본다.

---

## 7. Rollback / feature flag

별도 feature flag 는 필요 없다.

사유:

- read-only admin page 이며 DB mutation 이 없다.
- 신규 infra resource, queue, scheduler, storage bucket, migration 이 없다.
- gateway 는 기존 `/api/v1/slips/**` route 를 재사용한다.
- 장애 시 admin 메뉴/route 노출을 되돌리거나 이전 app image 로 rollback 하면 된다.

단, 이후 slice 에서 재업로드, 삭제, 상태 변경, presigned download 발급이 추가되면 feature flag 또는 role-gated rollout 을 재검토한다.

---

## 8. 운영 위험 / 모니터링

| 위험 | 모니터링 / 대응 |
|---|---|
| 과도한 날짜 범위 조회로 slip-service DB 부하 | 기본 조회 기간 제한, 최대 range validation, slow query log 확인 |
| attachment join 누락으로 사진 상태 오판 | `MISSING` / `UPLOADED` / `FAILED` fixture 를 나눈 repository/controller test |
| 내부 UUID 또는 storage key 노출 | DTO contract test, frontend type guard, screenshot visible text guard |
| admin role 우회 | `JwtAuthentication` + slip-service role guard test. `MASTER` / `MANAGER` 등 풀네임 role 로 문서화 |
| raw screenshot URL 404 | PR 최종 HEAD SHA pin + `HEAD 200` 확인 |
| GitGuardian false positive | 새 secret-like 문자열을 만들지 않고, 필요한 값은 placeholder 로 유지 |
| 장애 triage 지연 | gateway 4xx/5xx, slip-service `/actuator/prometheus`, request latency, error log 를 PR 배포 직후 확인 |

운영 배포 후 1차 확인:

```powershell
# gateway route reachable
Invoke-WebRequest -Method Get -Uri "https://<host>/api/v1/slips/admin/photo-audit?from=2026-05-16&to=2026-05-16" -UseBasicParsing

# service health / metrics
Invoke-WebRequest -Method Get -Uri "https://<host>/actuator/health" -UseBasicParsing
```

운영 환경에서는 실제 JWT 와 admin 권한 계정으로만 확인한다. 인증 헤더, token, raw response 전문은 PR/문서에 붙이지 않는다.

---

## 9. Release checklist

- [x] `GET /api/v1/slips/admin/photo-audit` 가 gateway 를 통해 slip-service `/slips/admin/photo-audit` 로 전달된다.
- [x] slip-service focused tests 가 photo-audit 정상/빈 상태/필터/권한/UUID-free 응답을 검증한다.
- [x] Docker/JDK 환경에서 slip-service focused/full test 를 실행했다.
- [x] admin UI 또는 API client 변경 시 Frontend Desktop typecheck/lint/build 를 통과한다.
- [x] QA screenshot generator 가 D-AX-20 PNG 를 생성한다.
- [ ] PR 본문 raw screenshot URL 이 최종 HEAD SHA 기준 `HEAD 200` 이다.
- [x] 화면/API/스크린샷에 UUID, storage key, presigned/download URL 이 없다.
- [x] feature flag 없이 배포하며, rollback 은 이전 app image 또는 admin route/menu revert 로 처리한다.
- [ ] PR 발행 후 `gh pr checks --watch` 로 CI green 을 확인한다.

## 10. 한국어 요약

D-AX-20 은 아로로지스 admin 사진 감사 조회 화면이다. 외부 경로는 `/api/v1/slips/admin/photo-audit`, 실제 slip-service 경로는 `/slips/admin/photo-audit` 이며 기존 gateway `/api/v1/slips/**` 라우트로 처리한다. 읽기 전용 기능이므로 별도 feature flag 는 필요 없지만, backend query endpoint 이기 때문에 slip-service 테스트와 가능하면 Docker/Testcontainers 검증을 권장한다. 릴리스 전에는 PR 스크린샷 raw URL `HEAD 200`, UUID 비노출, CI green, 운영 모니터링 기준을 반드시 확인한다.
