# SP-08-8 자격 평문 비공개 가드 강화

> **슬라이스**: SP-08-8
> **작업자**: DevOps (Claude)
> **완료일**: 2026-05-18
> **PR 연관**: feat/sp-08-8-credential-plaintext-guard
> **베이스 커밋**: `3e311e6e` (SP-08-7 머지 직후 main HEAD)

---

## §1 목적 및 배경

SP-08-7에서 Notion runtime 의존 zero 가드를 도입했다. 본 슬라이스는 그 패턴을 확장하여 Notion 이외의 자격 평문(API 키, JWT, Google Sheet ID 직접 대입 등)이 코드베이스에 평문으로 커밋되는 것을 CI 단계에서 사전 차단한다. GitGuardian이 탐지하기 전에 자체 가드를 구축함으로써 secret leak 회고 발생을 방지한다.

검사 대상은 소스 코드 뿐만 아니라 QA 문서 / dev-report / 운영 검증 문서 / Playwright fixture 까지 포함한다.

---

## §2 검사 대상 + 제외

### 검사 대상 디렉토리

| 경로 | 설명 |
|---|---|
| `docs/qa/sp-08-*/` | QA 리뷰 문서 (.md / .txt) |
| `docs/dev-reports/sp-08-*.md` | 개발 보고서 |
| `docs/operational-validation/` | 운영 검증 가이드 |
| `clients/desktop/playwright/` | Playwright fixture / helper |
| `services/*/src/main/` | 백엔드 서비스 소스 |
| `clients/{desktop,mobile-staff,arologis-desktop,arologis-mobile}/src/` | 프론트엔드 소스 |

### 검사 제외 (화이트리스트)

| 패턴 | 사유 |
|---|---|
| `node_modules/` `build/` `dist/` `.gradle/` `out/` | 빌드 산출물 |
| `*.d.ts` | 타입 선언 자동 생성 파일 |
| `clients/desktop/playwright/` | Playwright 테스트 단언 코드 |
| `tools/legacy-gas/` | 레거시 GAS 스냅샷 — 변경 금지 |
| `tools/operational-validation/` | placeholder 전용 운영 스크립트 |
| `services/*/bin/` | Gradle 빌드 산출물 |
| `services/*/src/test/` | 테스트 픽스처 |
| `clients/*/src/renderer/api/mock.ts` | 프론트 mock 픽스처 (dummy 번호) |
| `clients/*/src/renderer/api/excelExportMock.ts` | 엑셀 export mock |
| `db/migration/V*__seed_*.sql` | Flyway 시드 더미 데이터 |
| `docs/dev-reports/sp-08-8-*` | 본 보고서 자체 |
| `.claude/memory/` | Claude 메모리 파일 — UUID 정상 존재 |

---

## §3 금지 패턴 (자격 증명 유형별)

| 번호 | 유형 | 정규식 패턴 | 설명 |
|------|------|------------|------|
| 1 | Notion key 직접 대입 | `(NOTION_TOKEN\|NOTION_API_KEY)\s*=\s*[^$\s{]...` | SP-08-7 일관 — 실값 대입 형태만 탐지 |
| 2 | AWS Access Key | `AKIA[0-9A-Z]{16}` | AWS IAM permanent key |
| 3 | OpenAI API Key | `sk-[A-Za-z0-9]{20,}` | OpenAI API key 포맷 |
| 4 | JWT 3파트 | `eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+` | 3-segment JWT 실값 |
| 5 | Aligo API Key 직접 대입 | `ALIGO_KEY\s*=\s*[^$\s{]...` | 알리고 SMS API key 실값 대입 |
| 6 | Google Sheet ID 직접 대입 | `GOOGLE_SHEETS_SHEET_ID\s*=\s*1[A-Za-z0-9_-]{43}` | docs 영역 환경변수 직접 대입 형태만 탐지 |

**허용 패턴**: 변수명 참조 (`NOTION_TOKEN`, `${BOOTSTRAP_SHEET_ID:...}`) 및
OrgChartSeeder seed 비밀번호 (`${QA_MASTER_PASSWORD}`) 는 금지 패턴에 해당하지 않는다.
`GOOGLE_SHEETS_SHEET_ID` 환경변수 default 값으로 삽입된 Sheet ID는 ENV 오버라이드 가능하여 허용.

---

## §4 DevOps grep 가드 스크립트

**파일**: `scripts/check-credential-plaintext.sh`

SP-08-7의 `check-notion-zero.sh` 구조를 계승한다.

### 동작

1. CODE_DIRS (`services/*/src/main/`, `clients/*/src/`) + DOC_DIRS (`docs/qa/`, `docs/dev-reports/`, `docs/operational-validation/`, `clients/desktop/playwright/`) 를 `grep -rEn` 전수 탐색
2. 화이트리스트 경로 필터링 (mock.ts, seed SQL, playwright/, tools/operational-validation/ 등)
3. `${...}` / `PLACEHOLDER_DEV_ONLY` / `SET_BY_OPS_PC` 형태 줄은 false positive 제외
4. 위반 발견 시 파일:라인 + 처리 지침 출력 후 `exit 1`
5. 전 영역 CLEAN 시 `exit 0` + 통과 메시지

### 로컬 실행

```bash
bash scripts/check-credential-plaintext.sh
```

---

## §5 CI 통합

### job: `credential-plaintext-guard`

**파일**: `.github/workflows/ci.yml` — `notion-zero-guard` job 직후 배치

```yaml
credential-plaintext-guard:
  name: Credential Plaintext Guard (SP-08-8)
  runs-on: ubuntu-latest
  timeout-minutes: 5
  steps:
    - name: 저장소 체크아웃
      uses: actions/checkout@v4
    - name: 자격 평문 비공개 정적 검사
      run: |
        chmod +x scripts/check-credential-plaintext.sh
        bash scripts/check-credential-plaintext.sh
```

**특징**:
- 독립 병렬 실행 (`needs` 없음) — `notion-zero-guard`와 동급 guard 계층
- timeout 5분 — grep 정적 분석 실측 예상 ~30초
- exit 1 시 CI fail — 평문 자격 증명 발견 즉시 PR 머지 차단
- Node / JDK / Docker 불필요

---

## §6 잔존 Reference 검토 결과 (2026-05-18 전수 스캔)

### 검사 범위

- `docs/qa/sp-08-*/`, `docs/dev-reports/sp-08-*.md`, `docs/operational-validation/`
- `clients/desktop/playwright/`
- `services/*/src/main/`, `clients/*/src/`

### 패턴별 스캔 결과

| 패턴 | 결과 | 비고 |
|------|------|------|
| AWS Access Key `AKIA[0-9A-Z]{16}` | 0건 | CLEAN |
| OpenAI Key `sk-[A-Za-z0-9]{20,}` | 0건 | CLEAN |
| JWT 3파트 `eyJ...` | 0건 | CLEAN |
| `ALIGO_KEY=<실값>` | 0건 | CLEAN |
| `NOTION_TOKEN=<실값>` | 0건 | CLEAN |
| 사업자등록번호 `\d{3}-\d{2}-\d{5}` | accounting seed SQL + desktop mock.ts | 화이트리스트 처리 |
| 한국 전화번호 `0xx-xxxx-xxxx` | desktop mock.ts + placeholder `010-0000-0000` | 화이트리스트 처리 |
| Google Sheet ID `1RJqO3jT-...` | docs/*.md mention + application.yml default | 판정 참고 |

### Google Sheet ID 판정 근거

`<SHEET_ID>` (종합견적서)는 다음 위치에 존재한다.

- `services/partner-order-service/src/main/resources/application.yml`: `${BOOTSTRAP_SHEET_ID:1RJqO3...}` 형태 — ENV 오버라이드 가능. 허용.
- `docs/operational-validation/*.md`, `docs/dev-reports/migration-*.md`: 문서 mention. 허용.
- `clients/desktop/playwright/`: 화이트리스트.

`GOOGLE_SHEETS_SHEET_ID=1RJqO3...` 형태의 직접 대입은 **현재 0건**이며, 이 형태만 가드가 탐지한다.

### tools/operational-validation/ 판정

`run-smoke-tests.ps1`, `import-notion-csv.ps1` 내 `${QA_MASTER_PASSWORD}`는 OrgChartSeeder dev-only 시드 비밀번호의 파라미터 기본값으로, 실 운영 비밀번호가 아니다. GitGuardian 탐지 이력 없음. 화이트리스트 처리.

**결론**: **실제 위반 0건** — 현재 GitGuardian 통과 상태와 일치.

---

## §7 SP-08-7과의 비교 및 통합 위치

| 항목 | SP-08-7 (notion-zero-guard) | SP-08-8 (credential-plaintext-guard) |
|------|----------------------------|--------------------------------------|
| 검사 대상 | Notion runtime 의존 코드 (api.notion.com 호출 등) | 자격 평문 (API 키/토큰/Sheet ID 직접 대입) |
| 패턴 수 | 7개 | 6개 |
| 문서 영역 포함 | X (docs/ 제외) | O (docs/qa, docs/dev-reports, docs/operational-validation) |
| Playwright 처리 | 화이트리스트 | 화이트리스트 (동일) |
| 시드/mock 처리 | N/A | 화이트리스트 (mock.ts, seed SQL) |
| CI job | `notion-zero-guard` | `credential-plaintext-guard` (직후 배치) |

---

## §8 회귀 방지 정책

| 계층 | 수단 | 빈도 |
|---|---|---|
| 정적 grep 가드 | `scripts/check-credential-plaintext.sh` | 모든 PR / push |
| CI 자동 차단 | `credential-plaintext-guard` job | 모든 PR / push |
| SP-08-7 Notion zero | `check-notion-zero.sh` + `notion-zero-guard` job | 모든 PR / push |
| GitGuardian | GitHub App 자동 탐지 | 모든 push |
| 코드 리뷰 | 5-team agent 리뷰 | 모든 PR |

신규 자격 증명 유형 추가 시 `check-credential-plaintext.sh` 패턴 배열에 추가 의무 (DevOps 책임).

---

## §9 산출물 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `scripts/check-credential-plaintext.sh` | 신규 | grep 가드 스크립트 (6 패턴 + 화이트리스트) |
| `.github/workflows/ci.yml` | 수정 | `credential-plaintext-guard` job 추가 (notion-zero-guard 직후) |
| `docs/dev-reports/sp-08-8-credential-plaintext-guard.md` | 갱신 | 본 보고서 |

---

## §10 후속 항목

| 번호 | 항목 | 우선순위 | 담당 |
|------|------|----------|------|
| 1 | `${QA_MASTER_PASSWORD}` dev seed 비밀번호 — Phase 11 AWS 이전 전 운영 비밀번호 교체 절차 문서화 | P1 | DevOps |
| 2 | 사업자등록번호 평문 가드 강화 — 실 거래처 번호가 Flyway seed에 포함될 경우 `XXX-XX-XXXXX` placeholder 정책 수립 | P2 | BE |
| 3 | Google Sheet ID rotation 정책 — 시트 공유 설정 변경 시 `BOOTSTRAP_SHEET_ID` ENV 업데이트 절차 | P2 | DevOps |
| 4 | `check-credential-plaintext.sh` + `check-notion-zero.sh` 통합 고려 — SP-08 종료 후 단일 `check-secrets.sh`로 병합 가능 | P3 | DevOps |
| 5 | GitGuardian dashboard false positive — `feedback_gitguardian_false_positive.md` 규칙에 따라 PM 자동 처리 | ongoing | PM |

---
