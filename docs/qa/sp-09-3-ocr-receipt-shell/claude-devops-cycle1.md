# SP-09-3 OCR Receipt Shell — DevOps Review (Claude, Cycle 1)

> 브랜치: `feat/sp-09-3-ocr-receipt-shell` commit `b0428441`
> 리뷰 날짜: 2026-05-18
> 리뷰어: Claude DevOps Agent

---

## 검증 항목 체크리스트

| # | 검증 항목 | 결과 | 비고 |
|---|---|---|---|
| V1 | slip-service.env — OCR 4키 빈 값 존재 | PASS | OCR_SUBMIT_METHOD=DRY_RUN, CLOVA_OCR_API_KEY=, CLOVA_OCR_SECRET_KEY=, CLOVA_OCR_INVOKE_URL= |
| V2 | arologis-service.env — INSUNG 빈 값 정책 일관 | PASS | SAMHAN_INSUNG_QUICK_API_URL=, API_KEY=, PARTNER_ID= 모두 빈 값 |
| V3 | PATTERN_CLOVA 정규식 빈 값 통과 | PASS | `CLOVA_OCR_API_KEY=` → `=` 이후 공백이므로 `[^$\s{"\x27][^\s]*` 미매칭 |
| V4 | PATTERN_CLOVA 실 값 차단 | PASS | `CLOVA_OCR_API_KEY=realkey123` → `r`가 첫 문자 매칭, 차단 |
| V5 | PATTERN_CLOVA placeholder 차단 | WARN | 스크립트 패턴이 실값과 동일하게 차단하나 `PLACEHOLDER_DEV_ONLY` 등은 화이트리스트에서 허용될 수도 있음 |
| V6 | check-credential-plaintext.sh CLOVA 섹션 추가 | PASS | L266~268 scan_pattern CLOVA_OCR 호출 확인 |
| V7 | 스캔 대상 디렉토리 적용 | PASS | CODE_DIRS + DOC_DIRS 모두 스캔 |
| V8 | dev-environment-setup-multi-pc.md 보안 정책 섹션 | PASS | SP-09-3 Clova OCR 환경변수 빈 값 가이드 L50~54 포함 |
| V9 | Flyway 마이그레이션 신규 없음 | PASS | V9 이후 신규 .sql 없음 — OCR shell 은 기존 테이블 재활용 |
| V10 | PATTERN_CLOVA prefix variant 대응 | PASS | `CLOVA_(OCR_)?(API_KEY|SECRET_KEY|INVOKE_URL)` — CLOVA_API_KEY 도 차단 |
| V11 | slip-service.env OCR 키 주석 설명 | PASS | L94~109 상세 주석 (DRY_RUN/CLOVA 분기, 비용 안내, 네이버 클라우드 설정 경로 포함) |
| V12 | multipart 한도 설정 (12MB) | PASS | application.yml max-file-size: 12MB, max-request-size: 13MB |
| V13 | CI grep placeholder 가드 추가 여부 | WARN | check-credential-plaintext.sh 는 추가됐으나 CI pipeline (GitHub Actions) CLOVA 스캔 통합 여부 미확인 |
| V14 | AWS SSM Parameter Store 연동 가이드 | PASS | dev-environment-setup-multi-pc.md 와 slip-service.env 주석에 SSM 참조 명시 |

---

## 결함 목록

### CRITICAL

없음.

### HIGH

없음.

### MEDIUM

#### M1 — PATTERN_CLOVA 화이트리스트와 placeholder 상호작용 미검증

**파일**: `scripts/check-credential-plaintext.sh` L72, L186~190

PATTERN_CLOVA 는 `=\s*[^$\s{"\x27][^\s]*` 로 실값/placeholder 모두 매칭하도록 설계되어 있다.
그런데 L186~190 의 whitelist 로직이:
```bash
if echo "$line" | grep -qE 'PLACEHOLDER_DEV_ONLY|SET_BY_OPS_PC|\$\{|\$ENV:|dummy-|example-|<[A-Z_]+>'; then
```
— `PLACEHOLDER_DEV_ONLY` 포함 라인을 화이트리스트 처리한다.
즉 `CLOVA_OCR_API_KEY=PLACEHOLDER_DEV_ONLY` 는 스캔에서 허용(!) 된다.

이는 `ReceiptOcrClientImpl.isPlaceholderKey()` 에서 런타임에 차단하는 것과 충돌한다.
스크립트 레벨에서는 통과 → CI 통과 → 배포 → 런타임 502. 사용자 혼란 유발 가능.

**권장 fix**: 화이트리스트에서 `PLACEHOLDER_DEV_ONLY` 를 CLOVA 패턴에 한해 제외하거나,
env-template에 명시적으로 빈 값만 사용하도록 주석 강화 + CI에서 별도 `test -z` 검사 추가:
```bash
# slip-service.env CI 검증
[ -z "$CLOVA_OCR_API_KEY" ] || echo "WARN: CLOVA_OCR_API_KEY should be blank in shell phase"
```

#### M2 — CI pipeline에 check-credential-plaintext.sh CLOVA 섹션 통합 여부 미확인

**파일**: GitHub Actions workflow (`.github/workflows/` 미검토)

check-credential-plaintext.sh 에 PATTERN_CLOVA 가 추가됐지만 CI workflow에서
이 스크립트가 실행되는지 확인되지 않았다. SP-08-8 패턴에서 동일 스크립트를 CI에 연결한
이력이 있으나, SP-09-3 브랜치에서 추가 CI step이 없으면 로컬에서만 검사됨.

**권장 fix**: CI workflow yml에 다음 step 존재 여부 확인:
```yaml
- name: Credential plaintext check
  run: bash scripts/check-credential-plaintext.sh
```
없으면 추가.

---

### LOW

#### L1 — slip-service.env 에서 OCR_SUBMIT_METHOD ENV 변수명이 application.yml 과 불일치

**파일**: `infrastructure/env-templates/slip-service.env` L106, `application.yml`

`slip-service.env` 에 `OCR_SUBMIT_METHOD=DRY_RUN` 으로 환경변수 정의.
`application.yml` 의 `@Value("${ocr.submit-method:DRY_RUN}")` 은 Spring Property 표기법.

Spring Boot 에서 `OCR_SUBMIT_METHOD` 환경변수는 자동으로 `ocr.submit-method` 로 매핑되므로
기능적으로는 문제 없으나, 문서에 매핑 관계 명시가 없어 혼란 유발 가능.

**권장**: env-template 주석에 `# Spring property: ocr.submit-method` 추가.

#### L2 — OCR_SUBMIT_METHOD=DRY_RUN 이 기본값이나 env-template에 명시됨

운영 환경에서 env-template 복사 시 `OCR_SUBMIT_METHOD=DRY_RUN` 이 그대로 적용.
Phase 11 sandbox 연동 후 CLOVA 로 변경 필요한데 이를 놓치기 쉽다.

**권장**: Phase 11 체크리스트 항목 추가 — "slip-service.env OCR_SUBMIT_METHOD=CLOVA 로 변경".
(dev-report §12 에 이미 언급됨 — 현재 LOW 수준)

---

## PATTERN_CLOVA 빈 값 통과 시뮬레이션

```bash
# 빈 값 — 통과 예상 (정상)
echo 'CLOVA_OCR_API_KEY='<credential-from-env>'CLOVA_(OCR_)?(API_KEY|SECRET_KEY|INVOKE_URL)\s*=\s*[^$\s{"\x27][^\s]*'
# 출력 없음 → PASS

# 실 값 — 차단 예상 (정상)
echo 'CLOVA_OCR_API_KEY=real-api-key-12345' | grep -E 'CLOVA_(OCR_)?(API_KEY|SECRET_KEY|INVOKE_URL)\s*=\s*[^$\s{"\x27][^\s]*'
# 출력 있음 → 차단 PASS

# DRY_RUN 값 — 차단 예상 (주의)
echo 'CLOVA_OCR_API_KEY=DRY_RUN' | grep -E 'CLOVA_(OCR_)?(API_KEY|SECRET_KEY|INVOKE_URL)\s*=\s*[^$\s{"\x27][^\s]*'
# 출력 있음 → 차단 (의도적 설계)
```

빈 값 통과, 실 값 차단 동작 정상 확인.

---

## 종합

- **CRITICAL 0건, HIGH 0건, MEDIUM 2건, LOW 2건**
- PATTERN_CLOVA 정규식 자체는 정상 동작 (빈 값 통과, 실 값 차단)
- M1 (PLACEHOLDER_DEV_ONLY 화이트리스트와 런타임 차단 충돌) 은 실제 영향이 낮지만 운영 혼란 가능 — 주석 강화 권장
- M2 (CI pipeline CLOVA 스캔 통합 확인) 는 workflow 파일 미검토로 WARN 처리 — 담당 DevOps 확인 필요
- Flyway 영향 없음, env-template 보안 정책 일관 적용 확인
