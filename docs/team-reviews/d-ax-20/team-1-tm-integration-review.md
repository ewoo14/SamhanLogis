# D-AX20 Team 1 TM 통합 리뷰

검토 기준: `codex/d-ax-20-arologis-admin-photo-audit` 작업트리 현재 변경. 본 리뷰는 PR 본문에 들어갈 호환성 섹션 초안을 포함한다.

## 결론

| 항목 | 결과 | TM 판정 |
|---|---:|---|
| BE/FE/API 경로 계약 | PASS | `/api/v1/slips/admin/photo-audit` -> gateway `StripPrefix=2` -> slip-service `/slips/admin/photo-audit` 정합 |
| UUID/RAW URL 비노출 | PASS | `attachmentId`/`slipId`/`downloadUrl` 응답 미포함, UUID형 `uploadedBy`는 BE DTO 에서 `업로더 확인 필요`로 치환 |
| 화면 번호 정책 | PASS | D-AX20 신규 mock/test/QA 캡처/UIUX 예시는 `YYYY/MM/DD-{순번}`으로 통일 |
| QA 캡처 7장 | PASS | PNG 7장 존재, 1360x920, 25KB 초과, generator privacy guard PASS |
| 테스트/CI/Docker no-skip | PASS / 관리대상 | D-AX20 focused Playwright는 skip 없음. Docker/JDK 기반 PhotoAudit focused 및 slip-service full test는 PASS. 기존 Testcontainers IT skip 171건은 본 slice 신규 skip이 아니라 후속 no-skip hardening 관리대상 |

TM 검수 결과: PR 발행 가능. GitHub CI green 이후 부모 PM 재점검/머지 판단 필요.

## 5-agent 상시 대기 재검토 반영 (2026-05-16)

| 역할 | 최종 판정 | 반영 요약 |
|---|---|---|
| Backend | 승인 | `attachmentId`, `slipId`, `downloadUrl` 응답 제거. `uploadedBy` UUID/blank sanitize, 권한 annotation 회귀 테스트 보강 |
| Frontend | 승인 | `attachmentId/downloadUrl` 타입 제거, raw URL 없는 placeholder, `WAREHOUSE/MANAGER/MASTER` route/sidebar guard 유지 |
| Designer | 승인 | GPS 좌표 캡처 제거, 내부 audit rule id 캡처 제거, `배송사진/검수사진` 표시 통일, 56x56 placeholder 와 접근성 라벨 보정 |
| DevOps | PR 후보 승인 | gateway route 정합, Playwright 는 CI-enforced 가 아닌 로컬 수동 hard gate 로 명시. 머지 전 raw screenshot `HEAD 200` + `gh pr checks --watch` 필요 |
| QA | 승인 | Playwright 실행 명령 문서화, privacy guard 금지어 확대, PNG 7장 privacy guard PASS |

### PM 반영 상태 (2026-05-16)

아래 TM blocker 는 PM 통합 단계에서 반영했다.

| 항목 | 반영 |
|---|---|
| `attachmentId` 응답 노출 | D-AX20 read-only 범위에서는 불필요하므로 응답 DTO/FE 타입/mock/test에서 제거 |
| `downloadUrl` 응답 노출 | storage key/UUID 경유 노출 가능성이 있어 D-AX20 read-only 응답에서 제거. 화면은 안전한 metadata placeholder 를 표시 |
| `uploadedBy` raw user-id 표시 | BE DTO 생성 단계와 FE 표시 계층에 UUID 패턴 guard 를 추가해 UUID/blank 값은 `업로더 확인 필요`로 치환 |
| 내부 audit rule id 캡처 노출 | `LOW_FILE_SIZE`, `GPS_MISSING`, `CAPTURED_AT_MISSING` 대신 한글 사유만 캡처에 표시하고 generator privacy guard 에 내부 rule id 금지 패턴 추가 |
| URL성 전표번호 입력 | `http`, `https`, `X-Amz-`, `storageKey`, `downloadUrl` 입력은 원문을 보관/표시하지 않고 `전표번호만 입력해 주세요.` helper 로 차단 |
| BE 보안/JPQL 실제 경로 테스트 | MockMvc + `HeaderAuthenticationFilter` 로 WAREHOUSE 허용, SALES/미인증 403 고정. `@DataJpaTest` 로 type/date/slipNo/soft-delete JPQL projection 검증 |
| 번호 정책 충돌 | D-AX20 신규 mock/test/QA generator/UIUX 예시를 `YYYY/MM/DD-{순번}` 형식으로 정리 |
| PR raw URL 파일명 mismatch | dev-report/UIUX 캡처 파일명 예시를 실제 7장 파일명으로 정리 |
| `partnerName` nullable | FE 타입을 `string | null` 로 맞추고 화면에서는 빈 값이면 `—` 표시 |
| no-skip guard | D-AX20 Playwright spec 에 runtime skip 을 두지 않고, 캡처 산출물/계약을 dev-server 없이 검증하도록 전환 |

로컬 검증은 아래 최신 결과를 기준으로 한다. GitHub PR/CI 조회는 현재 세션의 네트워크 제한 때문에 push 후 재시도한다.

| 검증 | 최신 결과 |
|---|---|
| Screenshot generator | PASS — 7 PNG 재생성, privacy guard PASS |
| Desktop typecheck | PASS |
| Desktop lint | PASS — 기존 warning 3건, error 0 |
| Desktop build | PASS |
| D-AX20 Playwright contract | PASS — 3 tests, skip 없음 |
| Docker/JDK PhotoAudit focused test | PASS — `:services:slip-service:test --tests "*PhotoAudit*"` |
| Docker/JDK slip-service full test | PASS — 461 tests, failure 0, error 0, 기존 IT skip 171 |
| Testcontainers no-skip debt | 관리대상 — Linux test container 에서 Docker TCP raw 접근은 가능하나 Testcontainers provider 가 Docker Desktop remote env 를 valid 로 판정하지 못해 기존 IT skip 발생 |

## 주요 발견

1. 해소됨: `attachmentId`와 `uploadedBy` UUID형 값은 응답/사용자 화면에 그대로 표시하지 않는다.
   - 근거: `SlipPhotoAuditResponse`는 내부 `attachmentId`, `slipId`, `downloadUrl`을 필드로 갖지 않는다. `uploadedBy`는 DTO compact constructor 와 `PhotoAuditPage.tsx`의 `formatUploader()`에서 UUID 패턴과 blank 값을 `업로더 확인 필요`로 치환한다.
   - 영향: API 응답, 운영 화면, PR 캡처에서 raw UUID가 노출되는 경로를 차단했다.
   - 남은 후속: 장기적으로는 BE에서 표시명/기사코드/사원코드 성격의 `uploadedByDisplay`를 별도 제공하는 편이 더 명확하다.

2. 해소됨: QA 캡처 generator 와 UIUX 문서의 전표번호 예시는 신규 정책과 일치한다.
   - 정책: 화면 번호는 `YYYY/MM/DD-{순번}`.
   - 확인 결과: FE mock, controller test, QA generator, D-AX20 UIUX 예시는 `2026/05/15-1`, `2026/05/16-1` 계열로 맞췄다.
   - 영향: D-AX20 PR 캡처는 `YYYY/MM/DD-{순번}` 정책을 보여준다.
   - 후속: 기존 D-AX11~19 문서와 Samhan Public 문서에 남은 `SL-*`, `S-2026-*`, zero-padding 예시는 별도 전역 표준화 PR 후보로 관리한다.

3. 해소됨: PR raw URL 예시 파일명은 실제 캡처 파일명과 일치한다.
   - 실제 파일: `01-scope-contract.png`, `02-filter-table.png`, `03-thumbnail-no-url.png`, `04-reupload-candidate-badge.png`, `05-gps-audit-metadata.png`, `06-verification-matrix.png`, `07-pr-inline-capture-checklist.png`.
   - 불일치 문서: dev-report raw HEAD 200 예시는 `01-photo-audit-filter.png` 등 5개 구식 이름, UIUX 문서는 `01-photo-audit-filter-table.png` 등 6개 구식 이름을 사용한다.
   - 영향: PR 본문은 실제 7개 파일명으로 SHA pin raw URL을 만들 수 있다.
   - 남은 작업: push/PR 생성 후 최종 HEAD SHA 기준 `HEAD 200`을 확인한다.

4. 해소됨: BE nullable 계약과 FE 타입을 맞췄다.
   - `SlipPhotoAuditResponse.partnerName`은 없으면 null일 수 있고, FE `SlipPhotoAuditItem.partnerName`도 `string | null`이다.
   - 화면은 값이 없으면 `—`로 표시한다.

## 정적 검증 결과

| 검증 | 명령 | 결과 |
|---|---|---|
| 브랜치/작업트리 | `git status --short --branch` | `codex/d-ax-20-arologis-admin-photo-audit`; D-AX20 파일 다수 uncommitted |
| 커밋 diff 범위 | `git diff --name-only main...HEAD` | 출력 없음. 현재 변경은 commit 이 아니라 작업트리 변경 |
| untracked 범위 | `git ls-files --others --exclude-standard` | FE API/page, BE controller/DTO/test, QA docs/screenshots/generator 등 D-AX20 신규 파일 확인 |
| API 경로 | `rg -n "/api/v1/slips/admin/photo-audit|/slips/admin/photo-audit|photo-audit|PhotoAudit" clients services docs qa scripts` | FE API `/api/v1/slips/admin/photo-audit`, BE controller `/slips/admin/photo-audit`, gateway 문서 경로 정합 |
| gateway route | `rg -n "slips/\\*\\*|/api/v1/slips|StripPrefix|slip-service" services/api-gateway ...` | `Path=/api/v1/slips/**`, `StripPrefix=2`, `JwtAuthentication` 확인 |
| UUID regex | `rg -n "[0-9a-fA-F]{8}-..." ...D-AX20 files...` | 운영 UI/문서/캡처 source 에 실제 UUID 없음. controller 단위 테스트 fixture UUID 1건만 존재 |
| 민감 필드 텍스트 | `rg -n "attachmentId|slipId|downloadUrl|storageKey|presigned|raw URL" docs/... clients/...` | 문서에는 금지/가드 설명으로 등장. API 응답에는 `attachmentId/slipId/downloadUrl` 미포함 |
| 업로더 노출 | `rg -n "uploadedBy|X-User-Id" services/slip-service clients/desktop/src/renderer` | `uploadedBy`는 BE DTO 와 FE 에서 UUID형 값을 안전 문구로 치환 |
| 번호 정책 | `rg -n "SL-|2026/[0-9]{2}/[0-9]{2}-|dispatchNo|배차번호|전표번호" ...` | D-AX20 신규 파일은 정책형 번호. 기존 문서의 과거 `SL-*` 예시는 후속 전역 표준화 대상 |
| 캡처 개수/크기 | PowerShell `System.Drawing.Image::FromFile` over `docs/qa/.../screenshots/*.png` | 7장 모두 `1360x920`, 54KB~123KB |
| skip 검색 | `rg -n "skip\\(|test\\.skip|@Disabled|--skip|skipTests|xdescribe|xit" ...` | D-AX20 focused Playwright/QA generator 에 skip 없음. 기존 slip IT Docker unavailable skip 은 별도 no-skip hardening 대상 |
| focused BE test | Docker/JDK Gradle `:services:slip-service:test --tests "*PhotoAudit*"` | PASS |
| Docker | `DOCKER_HOST=tcp://localhost:2375 docker info` | PASS. Docker Desktop TCP daemon 접근 가능. Testcontainers provider 판정 문제는 별도 관리 |
| workflow hard-fail | `rg -n "photo-audit|d-ax-20|PhotoAudit" .github/workflows ...` | D-AX20 focused workflow 없음. `qa-e2e.yml`은 `npx playwright test --reporter=list || true` |

## 항목별 리뷰

### 1. BE/FE/API 계약

PASS. FE `listSlipPhotoAudit()`는 `/api/v1/slips/admin/photo-audit`를 호출하고, api-gateway 의 `slip-service-v1` route 는 `/api/v1/slips/**`에 `StripPrefix=2`를 적용한다. slip-service controller 는 `/slips/admin/photo-audit`에 매핑되어 요청 경로가 맞다.

권한도 FE `WAREHOUSE / MANAGER / MASTER`, BE `@PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")`로 일치한다. 응답 wrapper 는 FE `ApiEnvelope<PageResponse<SlipPhotoAuditItem>>`와 BE `ApiResponse<Page<SlipPhotoAuditResponse>>` 조합으로 기존 Spring Page subset 을 소비한다.

계약 주의점은 `partnerName` nullable 여부와 `uploadedBy` 표시명/ID 의미다. UUID형 업로더 값은 안전 문구로 치환한다.

### 2. UUID / raw URL 비노출

PASS. `attachmentId`, `slipId`, `downloadUrl`은 API 응답에 포함하지 않고 화면 텍스트, row key, testID, 접근성 label 에도 들어가지 않는다.

`uploadedBy`는 raw user-id일 수 있으므로 BE DTO 와 `formatUploader()`에서 UUID 패턴과 빈 값을 `업로더 확인 필요`로 치환한다. 실제 subject 또는 gateway user-id가 UUID여도 API 응답, 사용자 화면, 캡처에 UUID가 보이지 않는다.

### 3. 화면 번호 정책

PASS. D-AX20 앱 mock/test, PR 캡처 generator, UIUX 문서 예시는 `YYYY/MM/DD-{순번}` 정책을 따른다. 전역 기존 문서에 남은 `S-2026-*`, `SL-*` 계열 예시는 D-AX20 범위를 벗어나며 후속 전표/배차 표시번호 표준화 PR에서 정리한다.

### 4. QA 캡처 7장

PASS. 7장 모두 존재하고 크기도 충분하다.

| 파일 | 크기 |
|---|---:|
| `01-scope-contract.png` | 1360x920 / 54,453B |
| `02-filter-table.png` | 1360x920 / 58,098B |
| `03-thumbnail-no-url.png` | 1360x920 / 123,251B |
| `04-reupload-candidate-badge.png` | 1360x920 / 56,332B |
| `05-gps-audit-metadata.png` | 1360x920 / 63,772B |
| `06-verification-matrix.png` | 1360x920 / 61,786B |
| `07-pr-inline-capture-checklist.png` | 1360x920 / 63,250B |

PR 본문에는 위 실제 파일명으로 raw URL을 작성해야 한다. dev-report/UIUX에 남은 구식 파일명 예시는 사용하지 않는다.

### 5. 테스트 / CI / Docker no-skip

PASS / 관리대상.

- D-AX20 focused Playwright spec 은 dev-server 의존 runtime skip 없이 route/API/UUID guard/캡처 산출물을 검증한다. CI-enforced 는 아니므로 PR 본문 수동 hard gate 로 명시한다.
- Docker Desktop npipe 는 권한 문제였으나 `DOCKER_HOST=tcp://localhost:2375`로 daemon 접근을 확인했다.
- Docker/JDK 컨테이너 + host Gradle cache 로 `:services:slip-service:test --tests "*PhotoAudit*"`와 `:services:slip-service:test`를 실행했고 둘 다 PASS 했다. full test 결과는 461 tests, failure 0, error 0, 기존 IT skip 171 이다.
- full slip-service 결과의 기존 IT skip 171건은 D-AX20 신규 skip 이 아니라 Testcontainers provider 가 Docker Desktop TCP remote env 를 valid 로 판정하지 못하는 기존 no-skip hardening 과제다.
- `.github/workflows/qa-e2e.yml`의 `|| true`는 repo 기존 정책/부채이며, D-AX20은 별도 hard-fail Playwright contract spec 으로 보완했다.

PR 본문에는 D-AX20 신규 테스트는 skip 없이 통과했음을 적고, 기존 Testcontainers IT skip 171건과 qa-e2e `|| true`는 후속 no-skip hardening 관리대상으로 분리한다. 최종 hard gate 는 GitHub CI green, PR raw screenshot URL `HEAD 200`, 부모 PM 재점검이다.

## 다른 4개 팀 호환성 리뷰

| 팀 | 호환성 판정 | PR 본문에 넣을 내용 |
|---|---|---|
| BE | 승인 | endpoint/gateway/role 정합. `attachmentId/downloadUrl` 응답 제거, `partnerName` nullable 계약 정리, `uploadedBy` UUID 표시 guard 반영 |
| FE | 승인 | API 호출 경로와 design-system import 정합. 화면/testID/accessibility 에 내부 UUID/raw URL 미노출 |
| Designer | 승인 | dense table 중심 UX 유지, D-AX20 예시 번호 `YYYY/MM/DD-{순번}` 정리 |
| DevOps | 조건부 승인 | Docker/JDK 로컬 검증 PASS. 기존 Testcontainers IT skip 171건은 후속 no-skip hardening 대상 |
| QA | 승인 | PNG 7장 존재, 크기 기준 충족, 캡처 generator privacy guard PASS, focused Playwright skip 없음 |

## PR 본문 섹션 초안

```markdown
## D-AX20 5-team 호환성 리뷰

| 팀 | 결과 | 메모 |
|---|---|---|
| BE | ✅ 승인 | `/api/v1/slips/admin/photo-audit` -> `/slips/admin/photo-audit` 경로와 `WAREHOUSE/MANAGER/MASTER` 권한 일치. `partnerName` nullable 계약 정리 |
| FE | ✅ 승인 | `ApiEnvelope<PageResponse<SlipPhotoAuditItem>>` 소비와 `/admin/photo-audit` route 등록 확인. 응답/화면에는 `attachmentId/slipId/downloadUrl` 없고 raw URL 텍스트 렌더링 없음 |
| Designer | ✅ 승인 | PR 캡처와 UIUX 예시는 화면 번호를 `YYYY/MM/DD-{순번}`으로 통일 |
| DevOps | ⚠️ 조건부 승인 | Docker/JDK 로컬 검증 PASS. 기존 Testcontainers IT skip 171건은 후속 no-skip hardening 대상 |
| QA | ✅ 승인 | QA PNG 7장 존재(1360x920, 25KB 초과), generator privacy guard PASS, focused Playwright skip 없음 |

### QA 캡처

- `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/01-scope-contract.png`
- `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/02-filter-table.png`
- `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/03-thumbnail-no-url.png`
- `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/04-reupload-candidate-badge.png`
- `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/05-gps-audit-metadata.png`
- `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/06-verification-matrix.png`
- `docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots/07-pr-inline-capture-checklist.png`

### 남은 게이트

- [x] `uploadedBy`가 UUID일 때 사용자 화면/캡처에 UUID가 보이지 않도록 보완
- [x] QA 캡처 번호를 `YYYY/MM/DD-{순번}` 정책으로 재생성
- [x] Docker/JDK 환경에서 `:services:slip-service:test --tests "*PhotoAudit*"` 검증
- [x] Docker/JDK 환경에서 `:services:slip-service:test` full 검증
- [ ] PR 본문 이미지 raw URL은 최종 HEAD SHA와 실제 7개 파일명으로 pin
- [ ] GitHub CI green 후 부모 PM 재점검/머지
```
