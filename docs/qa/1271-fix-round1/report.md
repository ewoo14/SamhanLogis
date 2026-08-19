# PR #1271 fix 라운드 1 보고서

브랜치 `fix/dps-inbound-compare`에서 `origin/main`을 먼저 병합했으며 충돌은 없었다. 커밋·push·add는 수행하지 않았다.

## 1. 레거시 정규화 규칙 원문

레거시 원문 `tools/legacy-gas/DPS 입고기록 비교/Index.html`을 직접 확인했다.

`Index.html:380-384`

```js
function cleanStr(v) { return String(v || '').trim(); }
function cleanModelName(name) {
  if (!name) return "";
  return cleanStr(name).split('[')[0].split('(')[0].split('.')[0].replace(/\s+/g, '');
}
```

또한 레거시는 `Index.html:398-401`에서 정규화 모델명을 키에 사용하고, `Index.html:444-453`에서 미소비 행을 수량+금액 우선으로 1:1 소비한다.

현행도 같은 규칙으로 모델명을 `trim → [, (, . 중 최초 위치까지 절단 → 모든 공백 제거`하도록 고쳤다. 대소문자 변경은 추가하지 않았다.

## 2. 미발견 2건 해소 실측

회귀 테스트에서 다음 양방향을 확인했다.

- `MODEL 01` ↔ `MODEL 01[검증]`
- `MODEL 02` ↔ `MODEL 02(구형)`
- `MODEL 03` ↔ `MODEL 03.001`
- `MODEL 04` ↔ `MODEL 040`은 매칭하지 않음

레거시 정규화 규칙을 적용한 뒤 앞의 3건은 미발견 0건이 되고, 마지막 부정 케이스는 `DPS_NOT_FOUND + SLIP_NOT_FOUND`로 남았다. 잘못된 부분 매칭은 회귀 테스트에서 발생하지 않았다.

## 3. 중복 키 과대 표시 전/후

동일 `납품번호+모델` 두 DPS 행을 사용했다.

| 상태 | 정확행(수량/금액) | 잔여행 | 불일치 건수 |
|---|---:|---:|---:|
| 수정 전 RED | 1행이 뒤에 있음 | 1행 | 2건 상당의 오판(첫 행 mismatch + 잔여행) |
| 수정 후 GREEN | 정확히 맞는 행을 먼저 소비 | 1행 | 1건(`SLIP_NOT_FOUND`) |

수정은 동일 키 후보 중 수량과 금액이 모두 맞는 미소비 행을 먼저 선택하고, 없을 때만 기존 첫 미소비 행으로 비교한다.

## 4. MANAGER 403 원인과 권한 처리

원인은 코드의 저장 endpoint 권한 선언이 아니라 권한 데이터 미부여였다. 저장 endpoint는 이미 `@RequirePermission(page = "inventory.dps", action = CREATE)`로 올바르게 보호되고 있었고, V39의 `inventory.dps` MANAGER grant에는 `can_download`만 명시되어 `can_create=false`였다.

권한을 넓히지 않고 MANAGER에 `inventory.dps CREATE`만 additive grant하는 `V109__grant_manager_dps_history_create.sql`을 추가했다. role template, MANAGER 기본 group, 기존 활성 MANAGER 계정 캐시를 모두 보강한다.

검증:

```text
$env:SAMHAN_GATEWAY_ATTESTATION='codex-1271'
./gradlew :services:auth-service:test --tests '*V39GuardGatedPageIT' --no-daemon
BUILD SUCCESSFUL
4 tests completed, 0 failed
```

## 5. 저장→복원 왕복

격리 inventory DB `codex-1271-r1-pg`에서 저장 테이블 초기 건수는 0건이었다. 실제 MANAGER 로그인 후 브랜치 inventory `28085`에 자동·명시 저장을 각각 눌러 호출했다.

```text
AUTO_LATEST 403 {"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=inventory.dps action=CREATE ... account permission missing"}
MANUAL_NAMED 403 {"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=inventory.dps action=CREATE ... account permission missing"}
dps_history_after_403 = 0
```

공유 auth DB에 migration을 수동 적용하는 것은 사용자가 금지한 공유 DB write이므로 수행하지 않았다. 따라서 이번 라운드의 MANAGER 라이브 저장→복원은 **미검증**이다. V109 적용 후 동일 계정으로 자동 저장, 명시 저장, 저장내역 상세 클릭, 실행 탭 복원까지 재검증해야 한다.

## 6. RED 원문

①·② RED:

```text
DpsCompareServiceTest > inbound_legacy_model_normalization_matches_bracket_parenthesis_dot_and_spaces() FAILED
java.lang.AssertionError at DpsCompareServiceTest.java:273

DpsCompareServiceTest > inbound_duplicate_key_consumes_exact_quantity_and_amount_row_first() FAILED
java.lang.AssertionError at DpsCompareServiceTest.java:294
18 tests completed, 2 failed
```

③ RED:

```text
V39GuardGatedPageIT > MANAGER는 DPS 비교 결과 저장 CREATE 권한을 가진다 FAILED
org.opentest4j.AssertionFailedError at V39GuardGatedPageIT.java:61
```

첫 권한 실행은 attestation 누락으로 기동 실패했으며, `SAMHAN_GATEWAY_ATTESTATION=codex-1271` 주입 후 위 권한 RED를 실제 확인했다.

## 7. 잃으면 안 되는 것 재현

현재 브랜치 JAR의 실제 라이브 Playwright 결과:

| 케이스 | 입고전표 라인 | DPS 행 | 정상 일치 | 불일치 |
|---|---:|---:|---:|---:|
| A 실 헤더 | 77 | 77 | 77 | 0 |
| C 수량 동일·금액 변경 | 77 | 77 | 76 | 1 |
| D 수량 변경 | 77 | 77 | 76 | 1 |
| B 전량 동일 | 77 | 77 | 77 | 0 |

C 상세는 입고합계 `11,000`, DPS 합계 `12,000`, 수량 `1=1`로 `합계금액 불일치`를 검출했다. D 상세는 수량 `1↔2`로 `수량 불일치`를 검출했다. 조회 source는 실제 `GET /internal/slips/inbound-lines?from=2025-01-01&to=2026-08-17`이며 출고 잔재는 없었다.

①·②를 고치면서 정상 A/B가 77건으로 회복된 이유는 모델 접미사와 중복 행을 레거시처럼 처리했기 때문이다. C/D의 의도적 변경은 각각 1건으로 그대로 남았다.

## 8. 스크린샷

headless Chromium Playwright `1271-dps-inbound-compare-real-qa.spec.ts`를 실제 로그인 후 실행했다. renderer `5942`, inventory `28085`, slip `28086`을 모두 사용했다. 캡처는 `resolveQaShotsDir()`를 경유하고 `QA_SHOTS_DIR`를 아래 확정 경로로 지정했다. 네 PNG를 원본 해상도로 직접 열어 카드·상세행을 확인했다.

- [A — 실 헤더 77행](./screenshots/01-A-real-header-77-rows-real-qa.png): 77/77/77/0
- [C — 금액 불일치](./screenshots/02-C-same-qty-amount-mismatch-real-qa.png): 77/77/76/1, 11,000↔12,000
- [D — 수량 불일치](./screenshots/03-D-quantity-mismatch-real-qa.png): 77/77/76/1, 1↔2
- [B — 전량 일치](./screenshots/04-B-all-match-zero-mismatch-real-qa.png): 77/77/77/0

## 9. 최종 `git status --porcelain` 원문

```text
 M services/auth-service/src/test/java/com/samhanair/logis/auth/it/V39GuardGatedPageIT.java
 M services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsCompareService.java
 M services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/DpsCompareServiceTest.java
?? docs/qa/1271-fix-round1/
?? docs/qa/1271-sol-merge-verdict/
?? services/auth-service/src/main/resources/db/migration/V109__grant_manager_dps_history_create.sql
```

## 10. 프로세스·컨테이너 회수

제가 기동한 branch slip `28086` PID 109892, branch inventory `28085` PID 121568, renderer `5942` PID 3224를 종료했다. 격리 컨테이너 `codex-1271-r1-pg`도 삭제했다.

```text
28085/28086/5942 LISTEN 확인: 출력 없음
docker rm -f codex-1271-r1-pg
codex-1271-r1-pg
공유 samhan-* 컨테이너 수: 24
```

공유 컨테이너 24개는 그대로 두었다.

추가로 `./gradlew :services:inventory-service:test --tests '*Dps*' --no-daemon`은 45건 중 19건이 `GatewayAttestationMockMvcConfig.java:24`의 `SAMHAN_GATEWAY_ATTESTATION` 누락으로 기동 실패했다. 이 실패는 이번 수정 코드의 단위 테스트 실패가 아니며, `DpsCompareServiceTest` 18건은 `BUILD SUCCESSFUL`로 통과했다. 해당 통합 테스트 묶음은 attestation을 주입해 별도 재실행해야 한다.
