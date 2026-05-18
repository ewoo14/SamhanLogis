# DevOps Cycle 2 리뷰 — SP-10-2 인성데이타 퀵프로그램 vendor 통합

**PR #245 / Branch: feat/sp-10-2-insung-quick-program**
**Head commit: 36379838**
**리뷰어: DevOps**
**일자: 2026-05-19**

---

## 1. 총평

Cycle 1 에서 제기된 D1 (CI paths 누락), D2 (env-template TIMEOUT_MS 누락) 두 결함은 모두 commit `36379838` 에서 정확히 수정되었습니다.

신규 발견으로 **D3 (CI FAIL)** 이 확인되었습니다. `check-credential-plaintext.sh` 가 `docs/qa/sp-10-2-insung-quick-vendor/claude-devops-cycle1.md` 내 가드 동작 실증 예시 문장을 실값으로 오인하여 [FAIL] exit 1 을 반환합니다. 이는 `credential-guard` job 의 실제 CI FAIL 로 이어져 PR 머지가 차단됩니다.

---

## 2. Cycle 1 결함 해결 검증

### D1: arologis-ci.yml paths 에 `scripts/check-credential-plaintext.sh` 추가

- **pull_request paths 25번 줄**: `'scripts/check-credential-plaintext.sh'` 정확히 추가됨.
- **push paths 35번 줄**: `'scripts/check-credential-plaintext.sh'` 정확히 추가됨.

트리거 정합성 분석:
- 인성 가드 스크립트(`scripts/check-credential-plaintext.sh`)만 변경된 PR 은 이제 `credential-guard` + `backend` + `desktop` + `mobile` 4 job 이 모두 트리거됩니다.
- `ci.yml` push paths-ignore 에는 `scripts/check-credential-plaintext.sh` 가 포함되어 있지 않으므로, 해당 스크립트 변경 시 Samhan Public CI 도 동시에 실행됩니다. 이는 과도한 트리거처럼 보이나, credential-guard 는 전 repo 범위 스캔이므로 양쪽 모두 재실행하는 것이 보안상 적절합니다. 기능적으로 문제없음.

**D1: 해결 확인.**

### D2: SAMHAN_INSUNG_QUICK_TIMEOUT_MS env-template / docker-compose 추가

**arologis-service.env 77번 줄**: `SAMHAN_INSUNG_QUICK_TIMEOUT_MS=5000` 추가 확인.

**docker-compose.arologis.yml 74번 줄**: `SAMHAN_INSUNG_QUICK_TIMEOUT_MS: ${SAMHAN_INSUNG_QUICK_TIMEOUT_MS:-5000}` 추가 확인.

application.yml 76번 줄 매핑: `request-timeout-ms: ${SAMHAN_INSUNG_QUICK_TIMEOUT_MS:5000}` — 3-layer 일치.

**D2: 해결 확인.**

---

## 3. Cycle 2 신규 발견

### [D3 / Critical] credential-guard CI FAIL — claude-devops-cycle1.md 화이트리스트 누락

**파일**: `docs/qa/sp-10-2-insung-quick-vendor/claude-devops-cycle1.md`

`check-credential-plaintext.sh` 를 로컬에서 직접 실행한 결과:

```
[INSUNG_QUICK] .../claude-devops-cycle1.md:34:SAMHAN_INSUNG_QUICK_API_KEY=          # 빈 값 — 정상
[INSUNG_QUICK] .../claude-devops-cycle1.md:35:SAMHAN_INSUNG_QUICK_PARTNER_ID=       # 빈 값 — 정상
[INSUNG_QUICK] .../claude-devops-cycle1.md:37:SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET=   # 빈 값 — 정상
[INSUNG_QUICK] .../claude-devops-cycle1.md:80:- `SAMHAN_INSUNG_QUICK_API_KEY=<실값>` 형태의 평문 탐지 실증 확인 (DETECTED).
[INSUNG_QUICK] .../claude-devops-cycle1.md:81:- `SAMHAN_INSUNG_QUICK_API_URL=https://api.insungdata.co.kr/quick/v1` 형태도 탐지 확인 (DETECTED).
[FAIL] 자격 평문 비공개 정책 위반 — SP-08-8
```

exit code 1 반환 — `credential-guard` job CI FAIL.

**원인 분석**:
- cycle1.md 80번 줄: `` `SAMHAN_INSUNG_QUICK_API_KEY=<실값>` `` — `<실값>` 이 `[^$\s{"\x27][^\s]*` 정규식을 만족함.
- cycle1.md 81번 줄: `` `SAMHAN_INSUNG_QUICK_API_URL=https://api.insungdata.co.kr/quick/v1` `` — URL 이 실값으로 탐지됨.
- cycle1.md 34~37번 줄: 빈 값 자체(`=` 뒤 공백 주석)는 정상이나, 스크립트가 `.md` 확장자를 `docs/qa/` 범위에서 스캔하고 `scan_pattern` 의 줄 단위 화이트리스트 키워드(PLACEHOLDER_DEV_ONLY 등)가 해당 줄에 없어 탐지됨.
- 화이트리스트 `WHITELIST_PATTERNS` 에 `docs/qa/sp-10-2-insung-quick-vendor/` 경로가 없음. `docs/qa/sp-09-2-aligo-sms-real-send/` 등 기존 vendor QA 문서들은 화이트리스트에 개별 등록되어 있는 패턴.

**영향**:
- `arologis-ci.yml` 의 `credential-guard` job 이 이 PR 에서 FAIL 하면 `backend` / `desktop` / `mobile` job 은 독립 실행되나, 전체 CI 상태가 빨간불로 표시되어 PM 승인 차단 조건에 해당.
- PR #245 가 현재 branch 기준으로 `claude-devops-cycle1.md` 파일을 포함하므로 즉시 차단.

**수정 방법 (TM 전달)**:
`scripts/check-credential-plaintext.sh` 의 `WHITELIST_PATTERNS` 배열에 아래 항목 추가:

```bash
'docs/qa/sp-10-2-insung-quick-vendor/'
```

기존 패턴 `docs/qa/sp-09-2-aligo-sms-real-send/` 바로 아래에 삽입하면 됩니다. 이 디렉토리는 리뷰 결과 문서(예시 값, 마스킹 mention 포함)이므로 화이트리스트 예외가 정당합니다.

---

### [P1] SAMHAN_INSUNG_QUICK_NOTIFY_INVITE_CHANNEL env-template 선언 위치 혼재 (경미)

**arologis-service.env 78~79번 줄**:
```
SAMHAN_AROLOGIS_NOTIFY_DISPATCH_CHANNEL=insung-talk
SAMHAN_AROLOGIS_NOTIFY_INVITE_CHANNEL=aligo
```

**application.yml 79~81번 줄**:
```yaml
dispatch-channel: ${SAMHAN_AROLOGIS_NOTIFY_DISPATCH_CHANNEL:insung-talk}
invite-channel:   ${SAMHAN_AROLOGIS_NOTIFY_INVITE_CHANNEL:aligo}
```

**docker-compose.arologis.yml 78~79번 줄**:
```yaml
SAMHAN_AROLOGIS_NOTIFY_DISPATCH_CHANNEL: ${SAMHAN_AROLOGIS_NOTIFY_DISPATCH_CHANNEL:-insung-talk}
SAMHAN_AROLOGIS_NOTIFY_INVITE_CHANNEL:   ${SAMHAN_AROLOGIS_NOTIFY_INVITE_CHANNEL:-aligo}
```

3-layer (env-template / docker-compose / application.yml) 모두 일치. 채널 기본값 `insung-talk` / `aligo` 일관성 확인됨. **이상 없음.**

---

### [P1] SAMHAN_AROLOGIS_GPS_PRIORITY 도메인 정합 확인

**arologis-service.env 80번 줄**: `SAMHAN_AROLOGIS_GPS_PRIORITY=insung-lbs,app-gps,manual`

**docker-compose.arologis.yml 83번 줄**: `SAMHAN_AROLOGIS_GPS_PRIORITY: ${SAMHAN_AROLOGIS_GPS_PRIORITY:-insung-lbs,app-gps,manual}`

**application.yml 83번 줄**: `priority: ${SAMHAN_AROLOGIS_GPS_PRIORITY:insung-lbs,app-gps,manual}`

**ArologisMatcherProperties.Gps 클래스 83번 줄**: `private String priority = "insung-lbs,app-gps,manual";`

4-layer 모두 `insung-lbs,app-gps,manual` 일치. SP-10-2 코드 일관성 확인됨. **이상 없음.**

---

### [P2] Phase 11 AWS Secrets Manager 매핑 가능성 평가

현재 INSUNG_QUICK 6 env (API_URL / API_KEY / PARTNER_ID / SANDBOX_MODE / WEBHOOK_SECRET / TIMEOUT_MS) 는 EC2 `.env` 파일 직접 주입 패턴을 사용합니다.

Phase 11 Seoul `ap-northeast-2` 단일 환경 기준:

| 환경변수 | 민감도 | 권고 저장소 |
|---|---|---|
| SAMHAN_INSUNG_QUICK_API_KEY | 시크릿 | AWS Secrets Manager (`/samhan/arologis/insung-quick/api-key`) |
| SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET | 시크릿 | AWS Secrets Manager (`/samhan/arologis/insung-quick/webhook-secret`) |
| SAMHAN_INSUNG_QUICK_PARTNER_ID | 시크릿 (계약 코드) | AWS Secrets Manager 또는 SSM Parameter Store (SecureString) |
| SAMHAN_INSUNG_QUICK_API_URL | 설정값 | SSM Parameter Store (String, `/samhan/arologis/insung-quick/api-url`) |
| SAMHAN_INSUNG_QUICK_SANDBOX_MODE | 설정값 | SSM Parameter Store (String) |
| SAMHAN_INSUNG_QUICK_TIMEOUT_MS | 설정값 | SSM Parameter Store (String) |

현재 `docker-compose.arologis.yml` 의 환경변수 주입 구조는 Phase 11 cutover 시 `aws ssm get-parameter --with-decryption` 래퍼 스크립트로 `.env` 를 재생성하는 패턴으로 이관 가능합니다. 구조 변경은 불필요하며 Phase 11 cutover 이슈로 backlog 등록 권고.

**KMS 암호화 의무**: `sandbox-mode=false` (prod cutover) 전환 시 `WEBHOOK_SECRET` 과 `API_KEY` 는 반드시 KMS CMK 암호화 Secrets Manager 저장으로 전환 필요. prod cutover 전 DevOps 체크리스트 항목으로 메모.

---

### [P2] Playwright spec CI 동작 환경 검토

`arologis-ci.yml` 에 Playwright job 없음 — Playwright spec (`qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts`) 은 `qa-e2e.yml` 또는 수동 실행이 예상됩니다.

`qa-e2e.yml` 을 확인한 결과 arologis-desktop dev server 대상 Playwright 는 별도 workflow 로 분리되어 있습니다. 본 PR 에서 `arologis-ci.yml` 에 Playwright job 이 없는 것은 의도된 설계입니다 (`BASE_URL = http://localhost:5173` — dev server 필요, CI runner 에서 자동 실행 불가).

**이상 없음.**

---

### [P2] Testcontainers Linux CI 동작 검토

`AbstractPostgresIT`:
- `DockerClientFactory.instance().isDockerAvailable()` 체크 후 Docker 미가용 시 IT skip 처리.
- GitHub Actions `ubuntu-latest` runner 는 Docker daemon 이 기본 가용하므로 IT 5케이스 모두 실행됩니다.
- `POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")` 싱글턴 컨테이너. HikariCP 풀 3/1 축소 (SP-D4 회고 적용).
- `InsungQuickClient @MockBean` 격리 완비 — sandbox-mode=true 에서도 @MockBean 으로 실제 네트워크 호출 없음.
- `DynamicPermissionClient @MockBean` SP-D3 회고 의무 적용 확인.

**Testcontainers Linux CI 동작 이상 없음.**

---

### [P3] arologis-ci.yml 과 ci.yml matrix 충돌 없음 확인

`ci.yml` paths-ignore:
```yaml
paths-ignore:
  - 'services/arologis-service/**'
  - 'clients/arologis-desktop/**'
  - 'clients/arologis-mobile/**'
  - '.github/workflows/arologis-ci.yml'
  - '.github/workflows/arologis-deploy.yml'
```

`arologis-ci.yml` paths:
```yaml
paths:
  - 'services/arologis-service/**'
  - 'clients/arologis-desktop/**'
  - 'clients/web/design-system/**'
  - 'clients/arologis-mobile/**'
  - 'shared/**'
  - 'scripts/check-credential-plaintext.sh'
  - '.github/workflows/arologis-ci.yml'
```

- `services/arologis-service/**` 변경 시 `ci.yml` 은 skip, `arologis-ci.yml` 만 실행. 중복 빌드 없음.
- `shared/**` 변경 시 `ci.yml` (paths-ignore 에 shared 없음) + `arologis-ci.yml` 양쪽 모두 실행. 의도된 양쪽 재검증 패턴.
- `clients/web/design-system/**` 변경 시 `arologis-ci.yml` 트리거. `ci.yml` 도 동시 트리거 (paths-ignore 미포함). design-system 변경 시 Samhan Public + 아로로지스 양쪽 FE 재검증은 적절.

**matrix 충돌 없음.**

---

### [P3] INSUNG_QUICK env false positive 재확인 (TIMEOUT_MS)

`SAMHAN_INSUNG_QUICK_TIMEOUT_MS=5000` 은 `PATTERN_INSUNG` 스캔 대상이 아닙니다. 패턴은 `(API_KEY|API_URL|PARTNER_ID|WEBHOOK_SECRET)` 4종만 탐지하므로 `TIMEOUT_MS` 값(`5000`) 은 false positive 대상 아님. 확인 완료.

**env-template 및 docker-compose 의 SAMHAN_INSUNG_QUICK_TIMEOUT_MS=5000 에 대한 false positive 없음.**

---

## 4. 최종 판정

| 항목 | 등급 | 상태 | 설명 |
|---|---|---|---|
| D1 (CI paths) | Critical | RESOLVED | pull_request/push paths 양쪽 모두 추가 확인 |
| D2 (TIMEOUT_MS) | P2 | RESOLVED | env-template + docker-compose 3-layer 일치 |
| D3 (credential-guard FAIL) | Critical | **FAIL — 수정 필요** | claude-devops-cycle1.md 화이트리스트 누락 → CI FAIL |
| NOTIFY_CHANNEL 정합 | P1 | PASS | 3-layer 일치 |
| GPS_PRIORITY 정합 | P1 | PASS | 4-layer 일치 |
| Phase 11 AWS 매핑 | P2 | NOTED | prod cutover 시 KMS 암호화 의무 backlog 권고 |
| Playwright CI | P2 | PASS | 의도된 분리 (dev server 의존) |
| Testcontainers Linux | P2 | PASS | DockerAvailableCondition + @MockBean 완비 |
| matrix 충돌 | P3 | PASS | ci.yml 과 arologis-ci.yml 분리 정상 |
| TIMEOUT_MS false positive | P3 | PASS | PATTERN_INSUNG 4종 범위 외 |

**DevOps Cycle 2 판정: FAIL (D3)**

D3 수정 (1건): `scripts/check-credential-plaintext.sh` `WHITELIST_PATTERNS` 에 `'docs/qa/sp-10-2-insung-quick-vendor/'` 추가 후 Cycle 3 재검증 요청.

D3 수정 후 추가 DevOps 신규 결함 없음 — Cycle 3 은 D3 확인만으로 충분.
