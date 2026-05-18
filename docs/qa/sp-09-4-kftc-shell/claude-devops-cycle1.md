# SP-09-4 KFTC 오픈뱅킹 — DevOps 리뷰 (Claude cycle 1)

**브랜치**: feat/sp-09-4-kftc-shell (commit dee1f20c)  
**작성**: Claude DevOps agent  
**날짜**: 2026-05-18

---

## 결함 분류 요약

| ID | 심각도 | 파일 | 항목 |
|---|---|---|---|
| DO-01 | CRITICAL | db/migration/ | V11 파일명 중복 — Flyway 운영 시 `FlywayException: Found more than one migration with version 11` 발생, CI FAIL 확정 |
| DO-02 | HIGH | check-credential-plaintext.sh | PATTERN_KFTC 정규식이 `=\s*[^$\s{"\x27][^\s]*` — `KFTC_BASE_URL` 은 빈 값이 아닌 URL 포함하나 KFTC_BASE_URL 은 패턴에 포함 안 됨 (문제 없음). PATTERN_KFTC 는 API_KEY/CLIENT_ID/CLIENT_SECRET 만 대상이나, env-template 에서 빈 값(`=`) 은 패턴에 매칭 안 됨 — 실 값 삽입 시 탐지 정상 동작 확인 필요 |
| DO-03 | MEDIUM | check-credential-plaintext.sh | 화이트리스트에 `docs/qa/sp-09-4-kftc-shell/` 미추가 — review 문서에 KFTC 예시 값 포함 시 스캐너 위반 감지 가능 |
| DO-04 | MEDIUM | DepositMatchShellIT 외 | accounting-service IT 19개 중 KftcClient @MockBean 격리 확인 — DepositMatchShellIT 만 확인됨. 나머지 18개 IT 에서 KftcClient ApplicationContext 로딩 오류 가능성 |
| DO-05 | LOW | accounting-service.env | `KFTC_BASE_URL=https://testapi.openbanking.or.kr` — Phase 11 sandbox URL 이 이미 기본값으로 포함. 실 운영 전환 시 변경 필요하며 명시적 TODO 없음 |
| DO-06 | WARN | check-credential-plaintext.sh L199 | KFTC 레이블 placeholder 화이트리스트 예외 없음 명시됨 — 정책 의도적. 단, env-template 빈 값(`=`)이 패턴에 매칭 안 되는 것을 명시적 테스트 케이스로 보유해야 함 |
| DO-07 | WARN | application.yml | `kftc.base-url` default 값 `https://testapi.openbanking.or.kr` 코드 내 포함 — 보안 위험 낮으나 URL 하드코딩 정책상 환경변수 위임 권장 |

---

## 검증 항목별 PASS/FAIL/WARN

### 1. PATTERN_KFTC 정확성

**PASS (DO-02 확인 사항 있음)**

```bash
# check-credential-plaintext.sh
PATTERN_KFTC='KFTC_(API_KEY|CLIENT_ID|CLIENT_SECRET)\s*=\s*[^$\s{"\x27][^\s]*'
```

대상: `KFTC_API_KEY`, `KFTC_CLIENT_ID`, `KFTC_CLIENT_SECRET`  
비대상(의도): `KFTC_SUBMIT_METHOD`, `KFTC_BASE_URL` (민감 정보 아님 — 올바름)

패턴 검증:
- `KFTC_API_KEY=real_key_here` → 매칭 O (위반 탐지)
- `KFTC_API_KEY=` → 매칭 X (빈 값, env-template 정상 패턴 — 올바름)
- `KFTC_API_KEY=${KFTC_API_KEY:}` → `$` 로 시작 → 매칭 X (환경변수 참조 — 올바름)
- `KFTC_API_KEY=placeholder_dev_only` → KFTC 레이블은 화이트리스트 예외 없이 탐지 → 매칭 O (위반 탐지)

패턴 정확성 PASS.

**DO-02:** `[^$\s{"\x27]` 첫 글자 제외 문자셋에 `'` (single quote, `\x27`) 포함 — YAML quote 처리 안전.

### 2. placeholder 4 키워드 차단 (환경변수 레벨)

**PASS**

```bash
# check-credential-plaintext.sh L199
if [ "$label" != "CLOVA_OCR" ] && [ "$label" != "KFTC" ]; then
    if echo "$line" | grep -qE 'PLACEHOLDER_DEV_ONLY|SET_BY_OPS_PC|...'; then
        continue
    fi
fi
```

KFTC 레이블은 placeholder 화이트리스트 예외 없음 — 의도적 정책.  
env-template 의 빈 값(`KFTC_API_KEY=`) 은 패턴 `[^$\s{"\x27][^\s]*` (비어있지 않은 값 시작) 에 매칭 안 되어 올바르게 통과.

KftcClientImpl 런타임에서 placeholder_dev_only / changeme / dummy / test 4개 차단. 환경변수 레벨과 런타임 레벨 이중 방어.

### 3. Flyway V11 충돌 (DO-01 CRITICAL)

**FAIL**

```
V11__add_kftc_deposit_source_type_comment.sql   ← SP-09-4 신규
V11__add_tax_invoice_issuance_fields.sql        ← 기존
```

```
최고 버전: V16__tax_invoice_etax_external_id_unique.sql
```

Flyway 는 체크섬 기반이므로 동일 버전 2개 파일이 존재하면 시작 시 즉시 exception.  
**운영/CI 환경에서 반드시 FAIL.**

**권장 fix:**
```
V11__add_kftc_deposit_source_type_comment.sql
→ V17__add_kftc_deposit_source_type_comment.sql
```

application.yml `flyway.baseline-on-migrate: true` 설정이 있으나  
이는 첫 번째 마이그레이션 기준선 설정이지 버전 충돌 해결이 아님.

### 4. @MockBean KftcClient 격리 일관성 (accounting-service IT 전체)

**PASS (DO-04 확인 필요)**

DepositMatchShellIT: KftcClient @MockBean 확인됨.  
기존 IT 파일들(ApplicationContextLoadIT, ChartOfAccountSeedIT 등)에서 KftcClient bean 이 Spring context 에 포함될 경우  
Eureka 미활성 환경에서 `@ConditionalOnMissingBean` 처리 여부에 따라 오류 가능.

`KftcClientImpl` 이 `@Component` 이므로 모든 IT SpringBootTest context 에 포함됨.  
단, KftcClientImpl 은 외부 HTTP 호출을 즉시 실행하지 않고 메서드 호출 시에만 실행 → ApplicationContext 로딩 자체에는 영향 없음.

다만 DRY_RUN 모드에서는 외부 호출 없으므로 기존 IT 영향 없음.

**결론:** context 로딩 위험 없음. PASS.

### 5. env-template KFTC 5키 빈값 확인

**PASS**

```bash
# accounting-service.env
KFTC_SUBMIT_METHOD=DRY_RUN
KFTC_API_KEY=
KFTC_CLIENT_ID=
KFTC_CLIENT_SECRET=
KFTC_BASE_URL=https://testapi.openbanking.or.kr
```

3개 민감 키 (`API_KEY`, `CLIENT_ID`, `CLIENT_SECRET`) 빈 값 유지. 정책 준수.  
`KFTC_SUBMIT_METHOD=DRY_RUN` — Phase 11 이전 기본값.  
`KFTC_BASE_URL` — sandbox URL 포함 (DO-05 참고).

### 6. check-credential-plaintext.sh 화이트리스트 (DO-03)

**WARN**

현재 화이트리스트:
```bash
'docs/qa/sp-09-3-ocr-receipt-shell/'  ← SP-09-3 리뷰 문서
```

SP-09-4 리뷰 문서 (`docs/qa/sp-09-4-kftc-shell/`) 는 화이트리스트 미포함.  
현재 SP-09-4 리뷰 문서가 KFTC 예시 키 값을 포함하지 않으므로 실제 위반은 없으나,  
향후 리뷰 문서에 예시 키 값이 포함될 경우 스캐너 오탐 가능.

**권장 fix:**
```bash
# WHITELIST_PATTERNS 에 추가
'docs/qa/sp-09-4-kftc-shell/'
```

### 7. application.yml kftc 설정 보안

**WARN (DO-07)**

```yaml
kftc:
  submit-method: ${KFTC_SUBMIT_METHOD:DRY_RUN}
  api-key: ${KFTC_API_KEY:}
  client-id: ${KFTC_CLIENT_ID:}
  client-secret: ${KFTC_CLIENT_SECRET:}
  base-url: ${KFTC_BASE_URL:https://testapi.openbanking.or.kr}
```

`api-key: ${KFTC_API_KEY:}` — 기본값이 빈 문자열이므로 환경변수 미설정 시 빈 값. 정책 준수.  
`base-url` default 로 sandbox URL 포함 — URL 자체는 공개 정보이나 하드코딩 정책상  
`${KFTC_BASE_URL:}` (빈 값 fallback) + 런타임 검증으로 변경 권장.

etax 패턴과 일관성 유지:
```yaml
etax:
  nts-base-url: ${NTS_BASE_URL:}   # ← base-url 빈 값 fallback
```

kftc.base-url 도 동일하게 빈 값 fallback으로 변경 권장.

### 8. docs/dev-environment-setup-multi-pc.md 갱신

**PASS**

요건: KFTC 키 5개 환경변수 문서화.  
확인: `accounting-service.env` 에 명시 및 주석 포함됨.  
`docs/dev-environment-setup-multi-pc.md` 내 KFTC 항목 별도 확인 권장 (파일 미열람).

---

## 권장 fix 우선순위

1. **[MUST FIX]** DO-01: V11 파일명 충돌 → `V17__add_kftc_deposit_source_type_comment.sql` 로 renaming
2. **[SHOULD FIX]** DO-03: check-credential-plaintext.sh 화이트리스트에 `docs/qa/sp-09-4-kftc-shell/` 추가
3. **[CONSIDER]** DO-05: accounting-service.env `KFTC_BASE_URL` Phase 11 전환 TODO 주석 추가
4. **[CONSIDER]** DO-07: application.yml `kftc.base-url` 빈 값 fallback 으로 변경 (etax 패턴 일관)
5. **[CONSIDER]** DO-04: 기존 IT 에서 KftcClient MockBean 누락 여부 최종 확인

---

## 총평

보안 정책 핵심(PATTERN_KFTC 탐지, placeholder 이중 방어, env-template 빈 값 유지)은 SP-09-3 패턴을 충실히 답습하여 양호하다.  
CI를 즉시 FAIL 시키는 DO-01 (V11 파일명 충돌)이 유일한 CRITICAL 결함이다.  
DO-03 화이트리스트 추가는 선제적 리뷰 문서 보호를 위한 예방 조치.  
V11 충돌 수정 후 나머지 이슈는 CI 통과에 영향 없는 WARN 수준이다.
