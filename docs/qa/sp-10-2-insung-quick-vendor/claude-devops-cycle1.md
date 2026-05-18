# SP-10-2 DevOps 리뷰 — Cycle 1 (Claude)

> PR #245 | head: `f82a5ad5` | 리뷰어: DevOps (Claude) | 날짜: 2026-05-19

---

## 요약

| 항목 | 결과 |
|---|---|
| env-template 9 변수 / 4 키 빈 값 의무 | PASS (P0 결함 없음) |
| 운영 가이드 키 관리 절차 | PASS (화이트리스트 등록 정상) |
| CI grep 가드 INSUNG_QUICK 패턴 | PASS (탐지 정상) |
| docker-compose 환경변수 전달 | CONDITIONAL (누락 1건 — P2) |
| arologis-ci.yml credential-guard job | PASS |
| SP-09 CLOVA/KFTC 이후 위치 정합 | PASS |
| PowerShell 5.1 호환 | N/A (본 PR 신규 .ps1 없음) |
| CRLF/LF eol 정합 | PASS |

P0: 0건 / P1: 1건 / P2: 1건

---

## 검토 항목별 결과

### 1. env-template (`infrastructure/env-templates/arologis-service.env`)

**결과: PASS**

SP-10-2 신규 변수 9개 선언 확인:

```
SAMHAN_INSUNG_QUICK_API_URL=          # 빈 값 — 정상
SAMHAN_INSUNG_QUICK_API_KEY=          # 빈 값 — 정상
SAMHAN_INSUNG_QUICK_PARTNER_ID=       # 빈 값 — 정상
SAMHAN_INSUNG_QUICK_SANDBOX_MODE=true # boolean, 시크릿 아님 — 정상
SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET=   # 빈 값 — 정상
SAMHAN_AROLOGIS_NOTIFY_DISPATCH_CHANNEL=insung-talk
SAMHAN_AROLOGIS_NOTIFY_INVITE_CHANNEL=aligo
SAMHAN_AROLOGIS_GPS_PRIORITY=insung-lbs,app-gps,manual
SAMHAN_AROLOGIS_GPS_STALE_THRESHOLD_MS=60000
```

SP-08-8 INSUNG_QUICK 보안 정책 준수:
- 4 시크릿 키 (`API_URL`, `API_KEY`, `PARTNER_ID`, `WEBHOOK_SECRET`) 모두 빈 값(`=`) 유지 — 정상.
- placeholder 문자열 (`CHANGE_ME_*`, `SET_BY_OPS_PC`) 미사용 — INSUNG_QUICK 정책 일관 — 정상.
- CLOVA/KFTC 기존 패턴과 일관됨.

**주목 사항 (P2)**: `SAMHAN_INSUNG_QUICK_TIMEOUT_MS` 가 env-template 에 선언되지 않음.
`application.yml` 76번 줄에서 `${SAMHAN_INSUNG_QUICK_TIMEOUT_MS:5000}` 로 참조하며 기본값 5000ms 가 있어 런타임 장애는 없으나, 운영자가 API 응답 지연 조정 시 어떤 환경변수를 설정해야 하는지 env-template 에서 확인 불가. 동일하게 docker-compose 에도 미전달.

---

### 2. 운영 가이드 (`docs/operational-validation/sp-10-2-insung-key-rotation.md`)

**결과: PASS**

포함 내용 검증:
- §1 보안 원칙: 4키 빈 값 의무 + placeholder 금지 명시 — 정상.
- §2 키 발급 단계: 운영 PC `/opt/arologis/.env` 직접 입력 위임 + `.gitignore` 확인 의무 명시 — 정상.
- §3 sandbox → prod cutover 절차: `SANDBOX_MODE=false` 전환 + `MATCHER_PROVIDER=insung-quick` 전환 + rolling restart 명시 — 정상.
- §4 rotation 절차: 분기 1회 주기 + 담당자 명시 + rotation 이력 파일 (`key-rotation-log.md`) 분리 기록 — 정상.
- §5 검증 절차: actuator/health + matcher provider 확인 + webhook HMAC 검증 포함 — 정상.
- §6 비상 차단: mock fallback 전환 절차 포함 — 정상.

**화이트리스트 등록 확인**: `scripts/check-credential-plaintext.sh` 121번 줄에 `docs/operational-validation/sp-10-2-insung-key-rotation\.md` 화이트리스트 등록 완료. 운영 가이드 내 `<인성데이타_발급_키>` 등 예시 표기가 CI 오탐 없이 통과됨.

---

### 3. CI grep 가드 (`scripts/check-credential-plaintext.sh`)

**결과: PASS**

#### 3-1. PATTERN_INSUNG 정합

```bash
PATTERN_INSUNG='INSUNG_(QUICK_)?(API_KEY|API_URL|PARTNER_ID|WEBHOOK_SECRET)\s*=\s*[^$\s{"\x27][^\s]*'
```

- `SAMHAN_INSUNG_QUICK_API_KEY=<실값>` 형태의 평문 탐지 실증 확인 (DETECTED).
- `SAMHAN_INSUNG_QUICK_API_URL=https://api.insungdata.co.kr/quick/v1` 형태도 탐지 확인 (DETECTED).
- `SAMHAN_INSUNG_QUICK_API_URL=` (빈 값) 은 탐지되지 않음 — 정책 의도 일치.

#### 3-2. INSUNG_QUICK label placeholder 예외 없음 확인

`scan_pattern` 내 210번 줄:
```bash
if [ "$label" != "CLOVA_OCR" ] && [ "$label" != "KFTC" ] && [ "$label" != "INSUNG_QUICK" ]; then
```
INSUNG_QUICK 는 CLOVA_OCR / KFTC 와 동일하게 placeholder 허용 예외에서 제외됨 — 정책 일관 — 정상.

#### 3-3. SP-09 CLOVA/KFTC 위치 직후 배치 확인

패턴 선언 위치: PATTERN_CLOVA (7번) → PATTERN_KFTC (8번) → PATTERN_INSUNG (9번) — 순서 정합.
scan_pattern 호출: 5c(CLOVA_OCR) → 5d(KFTC) → 5e(INSUNG_QUICK) — 순서 정합.

#### 3-4. 화이트리스트

- `docs/operational-validation/sp-10-2-insung-key-rotation\.md` 추가 확인 — 정상.
- SP-09 기존 화이트리스트 항목 (`sp-09-3-ocr-receipt-shell/`, `sp-09-4-kftc-shell/`, `sp-09-5-phase9-integration/`) 유지 확인 — 정상.

**주목 사항 (정상 범위)**: PATTERN_INSUNG 이 `API_URL` 을 탐지 대상에 포함하고 있어 env-template 에서 `SAMHAN_INSUNG_QUICK_API_URL=https://...` 형태의 실 URL 삽입도 차단됨. 4키 정책 범위 내 URL 도 시크릿으로 취급 — 인성데이타 endpoint 노출 방지 의도 적합.

---

### 4. docker-compose.arologis.yml

**결과: CONDITIONAL**

#### 4-1. 환경변수 전달 현황

SP-10-2 신규 환경변수 전달 확인:

| 환경변수 | docker-compose 전달 | env-template 선언 | application.yml 참조 |
|---|---|---|---|
| SAMHAN_INSUNG_QUICK_API_URL | O | O | O |
| SAMHAN_INSUNG_QUICK_API_KEY | O | O | O |
| SAMHAN_INSUNG_QUICK_PARTNER_ID | O | O | O |
| SAMHAN_INSUNG_QUICK_SANDBOX_MODE | O | O | O |
| SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET | O | O | O |
| SAMHAN_AROLOGIS_NOTIFY_DISPATCH_CHANNEL | O | O | O |
| SAMHAN_AROLOGIS_NOTIFY_INVITE_CHANNEL | O | O | O |
| SAMHAN_AROLOGIS_GPS_PRIORITY | O | O | O |
| SAMHAN_AROLOGIS_GPS_STALE_THRESHOLD_MS | O | O | O |
| SAMHAN_AROLOGIS_MATCHER_PROVIDER | O | O | O |
| **SAMHAN_INSUNG_QUICK_TIMEOUT_MS** | **X** | **X** | O (기본값 5000) |

#### [P2] SAMHAN_INSUNG_QUICK_TIMEOUT_MS docker-compose / env-template 미선언

`application.yml` 76번 줄에서 `${SAMHAN_INSUNG_QUICK_TIMEOUT_MS:5000}` 으로 참조하나 docker-compose 와 env-template 에 해당 변수가 없음.

기본값 5000ms 로 동작하므로 런타임 장애는 없음. 그러나:
1. 운영 환경에서 인성데이타 API 응답 지연 시 timeout 조정 방법을 운영자가 env-template 으로 파악 불가.
2. docker-compose 미전달이므로 컨테이너 환경변수 오버라이드 경로가 없음 (환경변수로 주입해도 Spring 이 수신하지 않는 문제는 없으나, 운영 가이드에서 해당 변수 언급 부재).

권고: `SAMHAN_INSUNG_QUICK_TIMEOUT_MS=5000` 을 env-template 에 추가하고 docker-compose `environment` 섹션에 `SAMHAN_INSUNG_QUICK_TIMEOUT_MS: ${SAMHAN_INSUNG_QUICK_TIMEOUT_MS:-5000}` 전달.

#### 4-2. dev seed MATCHER_PROVIDER=mock 기본값 확인

```yaml
SAMHAN_AROLOGIS_MATCHER_PROVIDER: ${SAMHAN_AROLOGIS_MATCHER_PROVIDER:-mock}
```
docker-compose 기본값 `mock` — 인성데이타 sandbox 키 미발급 상태에서 안전 fallback 보장 — 정상.

#### 4-3. 보안 — 빈 값 기본 확인

4 시크릿 키의 docker-compose 기본값 패턴:
```yaml
SAMHAN_INSUNG_QUICK_API_URL: ${SAMHAN_INSUNG_QUICK_API_URL:-}
SAMHAN_INSUNG_QUICK_API_KEY: ${SAMHAN_INSUNG_QUICK_API_KEY:-}
SAMHAN_INSUNG_QUICK_PARTNER_ID: ${SAMHAN_INSUNG_QUICK_PARTNER_ID:-}
SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET: ${SAMHAN_INSUNG_QUICK_WEBHOOK_SECRET:-}
```
`:-` 로 기본값 빈 문자열 — 운영 PC `.env` 미설정 시 빈 값 유지 — 정상.

---

### 5. arologis-ci.yml — credential-guard job

**결과: PASS (주목 사항 P1)**

#### 5-1. credential-guard job 존재 확인

```yaml
credential-guard:
  name: 자격 평문 비공개 가드 (SP-08-8 + SP-10-2)
  runs-on: ubuntu-latest
  timeout-minutes: 5
```
`check-credential-plaintext.sh` 실행 + `chmod +x` 포함 — 정상.

#### [P1] pull_request trigger 에 `scripts/**` 경로 미포함

`arologis-ci.yml` pull_request paths:
```yaml
paths:
  - 'services/arologis-service/**'
  - 'clients/arologis-desktop/**'
  - 'clients/web/design-system/**'
  - 'clients/arologis-mobile/**'
  - 'shared/**'
  - '.github/workflows/arologis-ci.yml'
```

`scripts/check-credential-plaintext.sh` 수정 PR 발행 시 `arologis-ci.yml` 이 트리거되지 않음.

**보완 분석**: `ci.yml` 에서 `scripts/` 변경 시에도 pull_request 가 트리거되므로 (`paths-ignore` 에 `scripts/` 미포함) `ci.yml` 의 `credential-plaintext-guard` job 이 해당 변경을 커버함. 완전한 커버리지 공백은 아님.

그러나 `arologis-ci.yml` 의 `credential-guard` job 이 INSUNG_QUICK 특화 검증 의도를 명시적으로 포함하고 있으므로, `scripts/check-credential-plaintext.sh` 변경 시 `arologis-ci.yml` 도 트리거되는 것이 의도에 부합함.

권고: pull_request paths 에 `'scripts/check-credential-plaintext.sh'` 추가.

#### 5-2. push paths 에 workflow 파일 자체 누락

push paths 에 `.github/workflows/arologis-ci.yml` 미포함. main branch push 시 workflow 파일 자체 변경이 CI 를 트리거하지 않음.

이는 GitHub Actions 의 워크플로 자체 변경은 push trigger 에서 기본적으로 의미가 없는 구조이므로 (workflow 변경은 PR 단계에서 검증), 심각도 낮음. 참고 수준.

---

### 6. SP-09 CI grep 가드 패턴 일관성

**결과: PASS**

패턴 선언 위치 및 scan_pattern 호출 순서 모두 CLOVA(SP-09-3) → KFTC(SP-09-4) → INSUNG(SP-10-2) 일관 정합.

주석 번호 체계: (7) CLOVA → (8) KFTC → (9) INSUNG — 순서 연속성 유지.

---

### 7. PowerShell 5.1 호환

**결과: N/A**

본 PR 에서 신규 `.ps1` 파일 변경 없음. 기존 `.ps1` 파일 영향 없음.

---

### 8. CRLF/LF eol 정합

**결과: PASS**

`.gitattributes` 확인:
- `* text=auto eol=lf` — 전역 LF 기본값 적용.
- `*.ps1 text eol=crlf` — PowerShell CRLF 예외 — 정상.
- `*.sh` 명시적 선언 없음 — `text=auto eol=lf` 전역 정책에 의해 LF 처리됨.
  - `check-credential-plaintext.sh` 가 Linux CI (`ubuntu-latest`) 에서 LF 로 체크아웃되어 `bash` 실행 정상 — 정상.
- `docker-compose.arologis.yml`, `arologis-service.env`, `arologis-ci.yml` 모두 LF 적용 대상 — 정상.

---

## 결함 목록

| ID | 심각도 | 위치 | 설명 | 권고 |
|---|---|---|---|---|
| D1 | P1 | `.github/workflows/arologis-ci.yml` pull_request paths | `scripts/check-credential-plaintext.sh` 경로 미포함으로 해당 파일 단독 수정 PR 시 `arologis-ci.yml` credential-guard 미트리거 | pull_request paths 에 `'scripts/check-credential-plaintext.sh'` 추가 |
| D2 | P2 | `infrastructure/env-templates/arologis-service.env` + `infrastructure/docker/docker-compose.arologis.yml` | `SAMHAN_INSUNG_QUICK_TIMEOUT_MS` env-template 미선언 및 docker-compose 미전달 (application.yml 기본값 5000ms 로 런타임 영향 없음) | env-template `SAMHAN_INSUNG_QUICK_TIMEOUT_MS=5000` 추가, docker-compose `SAMHAN_INSUNG_QUICK_TIMEOUT_MS: ${SAMHAN_INSUNG_QUICK_TIMEOUT_MS:-5000}` 추가 |

---

## APPROVE 판정

P0 결함 없음. P1 1건 (CI trigger coverage 미완, 기존 ci.yml 로 부분 커버)은 보안 런타임 영향 없음. P2 1건 (timeout 변수 누락)은 운영 가시성 미흡으로 즉시 장애 없음.

**DevOps CONDITIONAL APPROVE** — D1(P1) 수정 권고. D2(P2) 수정 권고. 즉각 차단 사유 없음.
