# SP-09-2 DevOps 리뷰 — claude-devops-cycle1

리뷰어: Claude DevOps Agent
대상 브랜치: feat/sp-09-2-aligo-sms-real-send (commit 87d1e5f7)
리뷰 유형: read-only cycle 1

---

## 1. 결함 분류

### CRITICAL — 없음

### HIGH

**H-DO-01: `PATTERN_ALIGO` grep 패턴이 `ALIGO_KEY` 만 커버 — `SAMHAN_ALIGO_KEY` 미탐지**

`scripts/check-credential-plaintext.sh` 의 `PATTERN_ALIGO` 는:
```
PATTERN_ALIGO='ALIGO_KEY\s*=\s*[^$\s{"\x27][^\s]*'
```
이 패턴은 `ALIGO_KEY=실제값` 형태를 탐지한다. 그러나 `notification-service.env` 에서 실제 사용하는 변수명은 `SAMHAN_ALIGO_KEY` / `SAMHAN_ALIGO_USERID` / `SAMHAN_ALIGO_SENDER` 이다. `SAMHAN_ALIGO_KEY=실제값` 형태는 `ALIGO_KEY` 부분 문자열이 포함되므로 regex 상 탐지 가능하다. `SAMHAN_ALIGO_USERID=실제값` 은 `USERID` 부분이 `ALIGO_KEY` 패턴과 맞지 않아 **탐지되지 않는다.**

따라서 `ALIGO_USER_ID=realvalue` 또는 `SAMHAN_ALIGO_USERID=realvalue` 가 코드베이스에 들어와도 guard 가 통과한다. `ALIGO_USERID` 또는 `SAMHAN_ALIGO` 패턴을 추가해야 한다.

**H-DO-02: IT @MockBean 격리 — `AligoSmsAdapterPlaceholderRuntimeGuardIT` (Spring IT) 에서 `AligoSmsAdapter` 가 `@Autowired` + 직접 캐스팅됨 (bean scope 주의)**

`AligoSmsAdapterPlaceholderRuntimeGuardIT` Spring IT 에서 `@Autowired private SmsAdapter smsAdapter` 를 `(AligoSmsAdapter) smsAdapter` 로 직접 캐스팅한다. 이는 `SmsAdapter` 구현체가 정확히 `AligoSmsAdapter` 빈이어야 함을 가정한다. 만약 향후 `@MockBean private SmsAdapter smsAdapter` 를 다른 IT 에서 추가하면 Spring ApplicationContext 공유 시 충돌이 발생할 수 있다. 또한, `AligoProperties` 를 `@Autowired` 로 받아 테스트 중 값을 확인하지만 변경하지는 않으므로, 테스트 격리는 유지된다.

### MEDIUM

**M-DO-01: `notification-service.env` — `SAMHAN_ALIGO_API_URL` 이 실값(`https://apis.aligo.in`) 으로 설정됨**

env 44~47 라인:
```
SAMHAN_ALIGO_API_URL=https://apis.aligo.in
SAMHAN_ALIGO_KEY=
SAMHAN_ALIGO_USERID=
SAMHAN_ALIGO_SENDER=
```

`SAMHAN_ALIGO_KEY/USERID/SENDER` 가 빈 값이므로 `AligoSmsAdapter.isPlaceholder()` 가 true 를 반환하여 실제 외부 호출은 하지 않는다. API_URL 은 stub 분기에서 사용되지 않으므로 현재는 문제없다. 그러나 **API_URL 에 실제 운영 URL 이 기본값으로 설정된 것** 은 key 값이 실수로 채워질 때 즉시 운영 API 를 호출하는 위험을 내포한다. `SAMHAN_ALIGO_API_URL=` 빈 값으로 유지하거나 sandbox URL 을 기본값으로 사용하는 것을 권장한다.

**M-DO-02: Flyway V5 불필요 확인 — `send_audit` CHECK constraint 가 V4 에 포함되어 있는지 확인 필요**

커밋 메시지에 "Flyway V5 불필요 (V4 SEND_AUDIT CHECK 기존 활용)" 라고 명시되어 있다. V4 마이그레이션이 실제로 `save_mode = 'SEND_AUDIT'` 를 허용하는 CHECK constraint 를 포함하는지 검증해야 한다. V4 에 해당 enum 값이 없다면 IT 에서 DB insert 시 constraint violation 이 발생한다. IT 가 실제로 `SEND_AUDIT` row 를 성공적으로 삽입하고 있으므로 V4 가 이를 허용하고 있음을 간접 확인할 수 있다.

**M-DO-03: `docs/dev-environment-setup-multi-pc.md` — `SAMHAN_ALIGO_KEY` 와 `ALIGO_API_KEY` 두 변수명 병기로 혼란 가능성**

```
- `SAMHAN_ALIGO_KEY` (`ALIGO_API_KEY`) — 빈 값 유지
```

두 변수명이 병기되어 있어 어떤 것이 실제 `.env` 에 설정되어야 하는지 혼란스럽다. `notification-service.env` 에는 `SAMHAN_ALIGO_KEY` 만 사용하므로, 가이드 문서도 `SAMHAN_ALIGO_KEY` 단일 표기로 정리하고 괄호 표기를 제거하는 것이 권장된다.

**M-DO-04: IT 격리 — `cleanUp()` 의 직접 SQL DELETE 3개 테이블 순서 의존성**

```java
jdbcTemplate.update("DELETE FROM dispatch_sms_save_history");
jdbcTemplate.update("DELETE FROM notification_logs");
jdbcTemplate.update("DELETE FROM notification_requests");
```

FK 제약 관계가 있다면 DELETE 순서가 중요하다. `notification_logs` 가 `notification_requests` 를 FK 참조한다면 `notification_logs` 먼저 삭제해야 한다. 현재 순서가 `dispatch_sms_save_history` → `notification_logs` → `notification_requests` 로 정상이지만, 향후 테이블 관계 변경 시 취약하다.

### LOW

**L-DO-01: `_capture.cjs` — Node.js `require()` 구문 사용 (CJS) + Puppeteer 의존성 미명시**

`_capture.cjs` 파일이 Puppeteer 를 사용하는 것으로 보이나 `package.json` 에 devDependency 등록 여부 미확인. 팀 구성원이 `node _capture.cjs` 실행 시 `puppeteer not found` 에러를 만날 수 있다. 필요하다면 `clients/desktop/package.json` devDependencies 또는 스크립트에 Playwright 기반으로 통합 권장.

**L-DO-02: CI `credential-plaintext-guard` job — `SAMHAN_ALIGO_USERID` 패턴 누락 (H-DO-01 연계)**

H-DO-01 과 동일 사항. CI job 레벨에서 `SAMHAN_ALIGO_USERID=realvalue` 형태가 grep 에 걸리지 않는다.

**L-DO-03: `notification-service.env` 주석 내 변수명 매핑 — `ALIGO_USER_ID → SAMHAN_ALIGO_USERID` 로 표기되나 실제 환경변수 이름은 `SAMHAN_ALIGO_USERID`**

주석 라인 40: `# ALIGO_USER_ID → SAMHAN_ALIGO_USERID` — "레거시 → 신규" 매핑처럼 보이나 실제로 `ALIGO_USER_ID` 변수가 사용된 적 없다면 혼란을 줄 수 있다.

---

## 2. 검증 항목 PASS/FAIL/WARN

| 항목 | 결과 | 비고 |
|---|---|---|
| placeholder 금지 (env 빈 값) | PASS | KEY/USERID/SENDER 모두 빈 값 |
| PATTERN_ALIGO 미탐지 | PASS (부분) | KEY 탐지 가능, USERID/SENDER 독립 패턴 미적용 — H-DO-01 |
| Flyway V5 불필요 확인 | PASS (간접) | IT SEND_AUDIT insert 성공으로 V4 enum 포함 확인 |
| IT @MockBean 격리 일관 | PASS | 6개 외부 client MockBean 전 IT 통일 |
| docs/dev-environment-setup-multi-pc.md 갱신 | PASS | Aligo 4개 키 추가 확인 |
| credential-plaintext guard ALIGO_KEY | PASS | PATTERN_ALIGO 패턴 존재 |
| credential-plaintext guard ALIGO_USERID | FAIL | SAMHAN_ALIGO_USERID 패턴 없음 |
| API_URL 기본값 운영 URL | WARN | stub 분기에서 미사용이나 key 실수 채움 시 리스크 |
| cleanUp() FK 순서 | PASS | dispatch_sms_save_history → logs → requests 순서 적절 |
| 다중 PC 가이드 문서 | PASS | Aligo 4키 설명 추가 확인 |
| _capture.cjs 의존성 명시 | WARN | puppeteer devDep 미확인 |

---

## 3. 권장 fix

**P1 (HIGH H-DO-01 — 권장):** `scripts/check-credential-plaintext.sh` 에 `SAMHAN_ALIGO_USERID` / `SAMHAN_ALIGO_SENDER` 패턴 추가:
```bash
PATTERN_ALIGO_USERID='ALIGO_USERID\s*=\s*[^$\s{"\x27][^\s]*'
PATTERN_ALIGO_SENDER='ALIGO_SENDER\s*=\s*[^$\s{"\x27][^\s]*'
```

**P2 (MEDIUM M-DO-01 — 권장):** `SAMHAN_ALIGO_API_URL` 기본값을 빈 값 또는 sandbox URL 로 변경. 실값 기본 주입 회피.

**P3 (MEDIUM M-DO-03 — 권장):** dev setup 가이드에서 `(ALIGO_API_KEY)` 등 레거시 변수명 병기 제거.

**P4 (LOW L-DO-01):** `_capture.cjs` 에 실행 전제 조건(`npm install puppeteer`) 주석 추가 또는 README 에 캡처 실행 방법 문서화.

---

## 4. Claude TM 결정안

**APPROVE with P1 backlog 등록 (cycle 2 불필요)**

- CRITICAL 결함 없음.
- H-DO-01 (`SAMHAN_ALIGO_USERID` 미탐지) 은 현재 키가 빈 값이고 placeholder guard 가 adapter 레벨에서 작동하므로 즉각적 보안 위험은 없다. 그러나 Phase 11 sandbox 키 발급 시점 전에 반드시 패턴 추가 필요 — backlog 등록 권고.
- H-DO-02 (bean scope 캐스팅) 는 현재 동작에 영향이 없으므로 LOW 수용.
- env 구조, IT MockBean 격리, 문서 갱신 모두 컨벤션 준수 확인.
- M-DO-01 (API_URL 실값 기본 설정) 은 merge-time 빈 값으로 변경 권고.
