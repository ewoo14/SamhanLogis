# SP-08-7 Notion Runtime 의존 Zero — 정적 잠금 + CI 자동 가드

**브랜치**: feat/sp-08-7-notion-runtime-zero
**작성일**: 2026-05-18
**담당**: DevOps

---

## §1 Scope — Notion Zero 정책

SP-08 시리즈 [project_sp_08_legacy_gas_parity.md] 에 명시된 정책:
> "Notion runtime zero — 전 메뉴 GAS 동등 기능 우리 DB/API 잠금, Notion runtime 호출 zero"

Phase B2 마이그레이션 완료 시점에서 Notion API 는 SamhanLogis MS (slip-service / partner-service 등) 가 완전 흡수했다.
본 슬라이스는 해당 정책을 **정적 grep 가드 + CI 자동화** 로 회귀 방지 잠금한다.

---

## §2 검사 대상 + 제외

### 검사 대상 디렉토리

| 경로 | 설명 |
|---|---|
| `clients/web/` | estimate-app (GAS shim 포함), design-system |
| `clients/desktop/src/` | Electron 소스 (Playwright 제외) |
| `clients/mobile-staff/src/` | RN Expo 소스 |
| `services/*/src/main/` | 14 Samhan Public 백엔드 서비스 |

### 검사 제외

| 패턴 | 사유 |
|---|---|
| `node_modules/` `build/` `dist/` | 빌드 산출물 |
| `*.d.ts` | 타입 선언 자동 생성 파일 |
| `docs/` | 문서 (정책 명시 허용) |
| `tools/legacy-gas/` `tools/operational-validation/` | legacy GAS 원본 보존 영역 |
| `clients/web/estimate-app/lib/apps-script-shim.js` | noop 차단 구현체 (아래 §5 참조) |
| `clients/desktop/playwright/` | 테스트 단언 코드 (not.toContain 형태) |

---

## §3 grep 가드 스크립트

**파일**: `scripts/check-notion-zero.sh`

### 금지 패턴 (regex)

```
api\.notion\.com
Notion-Version
@notionhq/client
notion-sdk
NOTION_TOKEN
NOTION_API_KEY
NOTION_KEY
```

### 동작

1. 위 검사 대상 디렉토리를 `grep -rEn` 으로 전수 탐색
2. 화이트리스트 파일 필터링 (shim / playwright 테스트)
3. `services/` 는 `src/main/` 경로만 검사 (`src/test/` 제외 — 테스트 단언 허용)
4. 위반 발견 시 파일:라인 출력 후 `exit 1`
5. 전 영역 CLEAN 시 `exit 0` + 통과 메시지

### 실행 방법 (로컬)

```bash
bash scripts/check-notion-zero.sh
```

---

## §4 잔존 Reference 검토 결과 (전 영역)

### 검사 범위
- `clients/web/`, `clients/desktop/src/`, `clients/mobile-staff/src/`, `services/*/src/main/`
- 확장자: `.ts` `.tsx` `.js` `.jsx` `.java` `.kt` `.yml` `.yaml` `.properties`

### 발견 목록

| 파일 | 라인 | 내용 | 분류 |
|---|---|---|---|
| `clients/web/estimate-app/lib/apps-script-shim.js:172` | 172 | JSDoc 주석 `Notion API (https://api.notion.com/*)` | noop 차단 주석 |
| `clients/web/estimate-app/lib/apps-script-shim.js:177` | 177 | `const NOTION_HOSTS = ['api.notion.com']` | 차단 목록 선언 |
| `clients/desktop/playwright/sp-06-*/sp-06-*.spec.ts` | 161~162 | `expect(...).not.toContain('https://api.notion.com')` | 테스트 단언 (not.toContain) |
| `clients/desktop/playwright/sp-08-3-2-*/` | 129 | `expect(guarded).not.toMatch(/api\.notion\.com/)` | 테스트 단언 |
| `clients/desktop/playwright/sp-08-3-3-*/` | 134 | 동일 패턴 | 테스트 단언 |
| `clients/desktop/playwright/sp-08-3-4-*/` | 134 | 동일 패턴 | 테스트 단언 |
| `clients/desktop/playwright/sp-08-3-dispatch-*/` | 219 | `scanFiles` 의 금지 패턴 배열 | 테스트 단언 |
| `clients/desktop/playwright/sp-08-4-1-*/` | 92 | 동일 패턴 | 테스트 단언 |
| `clients/desktop/playwright/sp-08-legacy-*/` | 89~93 | `not.toContain('https://api.notion.com')` | 테스트 단언 |

**결론**: 실제 Notion API runtime 호출 코드 = **0건**. 전 영역 CLEAN.

---

## §5 처리 결정

### A. `apps-script-shim.js` — 허용 (화이트리스트)

`api.notion.com` 문자열이 `const NOTION_HOSTS = ['api.notion.com']` 형태로 **차단 목록 선언**에만 존재.
해당 shim 의 `_isExternalDeprecated()` 함수가 Notion 호출을 **noop + warn 으로 차단**하는 구현체임.
런타임 호출이 아닌 방어 코드이므로 grep 가드 화이트리스트에 등록하고 유지한다.

### B. `clients/desktop/playwright/` — 허용 (화이트리스트)

기존 SP-06 / SP-08-3 시리즈 Playwright 테스트가 `not.toContain` / `not.toMatch` 단언으로
Notion zero 상태를 검증하는 코드. 제거하면 회귀 가드가 약화되므로 유지한다.
테스트 파일은 검사 제외 경로로 등록.

### C. 백엔드 서비스 / 모바일 / 데스크톱 소스 — CLEAN

어떠한 Notion 의존도 발견되지 않음. 추가 조치 불필요.

---

## §6 CI 통합

### job: `notion-zero-guard`

**파일**: `.github/workflows/ci.yml`
**위치**: `frontend-ds` job 앞 독립 실행 (의존성 없음)

```yaml
notion-zero-guard:
  name: Notion Runtime Zero Guard (SP-08-7)
  runs-on: ubuntu-latest
  timeout-minutes: 5
  steps:
    - name: 저장소 체크아웃
      uses: actions/checkout@v4
    - name: Notion runtime 의존 zero 정적 검사
      run: |
        chmod +x scripts/check-notion-zero.sh
        bash scripts/check-notion-zero.sh
```

### 특징

- **독립 병렬 실행** — `needs` 없음. PR 트리거 즉시 시작
- **timeout 5분** — grep 정적 분석이므로 실제 소요 1초 미만
- **exit 1 시 CI fail** — Notion 패턴 발견 즉시 PR 머지 차단
- **Node/JDK/Docker 불필요** — 체크아웃 후 bash 즉시 실행
- **push + PR + workflow_dispatch** 모두 적용 (ci.yml on: 조건 상속)

---

## §7 Playwright RED Gate

**파일**: `clients/desktop/playwright/sp-08-7-notion-runtime-zero/sp-08-7-notion-runtime-zero.spec.ts`

QA 전용 정적 RED Gate spec (5 case). Node.js 내장 `fs` 재귀 탐색만 사용하여 외부 의존 없음.
Playwright test 파일 자체는 `check-notion-zero.sh` 화이트리스트에 이미 등록된 `clients/desktop/playwright/` 경로에 해당하므로 grep 가드 충돌 없음.

### 검증 항목

| Case | 검사 대상 | 금지 패턴 | 결과 |
|---|---|---|---|
| T1 | `clients/web` (shim 제외) | `api.notion.com` / `Notion-Version` / `@notionhq/client` / `notion-sdk` | PASS (0건) |
| T2 | `clients/desktop/src` | 동일 | PASS (0건) |
| T3 | `clients/mobile-staff/src` | 동일 | PASS (0건) |
| T4 | `services/*/src/main` | 동일 | PASS (0건) |
| T5 | 전 영역 | `process.env.NOTION_TOKEN` / `NOTION_API_KEY` / `System.getenv("NOTION_TOKEN")` 등 | PASS (0건) |

**실행 결과 (2026-05-18)**: `5 passed (4.7s)` — 전 영역 CLEAN 확인.

### 로컬 실행

```bash
cd clients/desktop
npx playwright test playwright/sp-08-7-notion-runtime-zero/sp-08-7-notion-runtime-zero.spec.ts --reporter=line
```

---

## §8 회귀 방지 정책

| 계층 | 수단 | 빈도 |
|---|---|---|
| 정적 grep 가드 | `scripts/check-notion-zero.sh` | 모든 PR / push |
| CI 자동 차단 | `notion-zero-guard` job | 모든 PR / push |
| Playwright RED Gate | `sp-08-7-notion-runtime-zero.spec.ts` (5 case) | Playwright CI 그룹 |
| Playwright 기존 단언 | sp-06 / sp-08-3 / sp-08-4-1 | Playwright CI 그룹 |
| 코드 리뷰 | 5-team agent 리뷰 | 모든 PR |

신규 서비스 추가 시 `SCAN_DIRS` 배열에 경로 추가 의무 (DevOps 책임).

---

## §9 후속 — SP-08-8 자격 가드

SP-08-8 에서 다룰 항목:
- `NOTION_TOKEN` / `NOTION_API_KEY` 실제 값이 `.env` / `application.properties` 에 잔존 여부 확인
- GitGuardian false positive 처리 기준 정립
- `tools/legacy-gas/` 내 hardcoded credential 재확인 + placeholder 치환

---

## §10 Verification

### 로컬 검증 절차

```bash
# 1. 스크립트 실행 (PASS 확인)
bash scripts/check-notion-zero.sh

# 2. 위반 패턴 주입 후 FAIL 확인 (삭제 필수)
echo "const x = 'api.notion.com'" >> /tmp/test-notion.ts
# → scripts/check-notion-zero.sh 에 /tmp/test-notion.ts 경로 추가 후 재실행

# 3. CI 워크플로우 구문 검증
cat .github/workflows/ci.yml | grep -A 10 "notion-zero-guard"
```

### CI 검증

PR 발행 후 GitHub Actions > `notion-zero-guard` job PASS 확인.
현재 기준 소요 시간: 체크아웃 약 20초 + grep 1초 미만 = 총 약 25초.
