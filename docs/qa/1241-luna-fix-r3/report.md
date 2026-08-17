# PR #1241 CODEX LUNA R3 수정 보고서

- 브랜치: `feat/gas-parity-order-web`
- 작업일: 2026-08-17 KST
- 커밋·push·add: 수행하지 않음
- 결론: 코드·자동검증은 완료했으나, 이 세션에서 격리 라이브 스택을 기동하지 못해 실화면 캡처 게이트는 미완료

## ① 결함 ① — 값이 끊긴 지점 실측표

| 경계 | 실측/코드 근거 | 판정 |
|---|---|---|
| V44 적용 | SOL 공유 DB Flyway V43, 실행 JAR에 V44 리소스 없음 | 공유 라이브에는 V44 미적용 |
| 저장 정본 | V44의 `fixed_allocation_amount`는 관계행에 기록되지만 화면 카탈로그 경로가 읽지 않음 | 관계 정본이 카탈로그 경계에서 소실 |
| 서버 전개 | `BundleExpander`가 구성품 전역 `Product.deliveryPrice`를 읽고, 고정 배분행만 별도 적용 | 배분 정본과 카탈로그 단가 경로가 분리 |
| 카탈로그 API | `EstimateCatalogInternalController.components()`가 `Product.deliveryPrice`만 반환 | 화면으로 가기 직전 소실 |
| estimate-app | `/components`의 `deliveryPrice`를 그대로 bootstrap 가격으로 사용 | 멀티값 104,060원·13,915원 도달 |
| SOL 화면 | 13행 정상 표에서 판넬 104,060원, 리모컨 13,915원 | 도달 결함 재현 |

수정 후에는 `bundle_component.context_delivery_price`를 V45에서 추가하고, 카탈로그 API와 `BundleExpander`가 모두 `관계 납품가 → 전역 납품가` 순서로 읽는다. 정본 백필 대상에는 판넬·리모컨·자재 15개 모델군을 포함했다.

양방향 계약은 관계값이 있는 행은 관계값을 사용하고, 관계값이 없는 행은 전역값 fallback을 유지하도록 구현했다. 관계 우선 IT와 product-service 전체 테스트가 통과했다.

## ② 결함 ② — 남은 차이의 원인

SOL 실측은 desktop 1,355,640원, estimate-app 1,523,236원으로 167,596원 차이였다.

404 직접 조회 경로는 이미 `dcConfigUnavailable`을 반환했지만, bulk DC 조회가 HTTP 200인 채 대상 거래처를 누락하면 `pickDc()`가 `null`을 반환했다. 이후 화면의 기존 merge가 `CONFIG` 기본 45%를 적용해 금액을 계산한 것이 잔여 원인이다.

bulk 맵에서 거래처가 없거나 사업자번호·거래처코드 어느 쪽도 매칭되지 않으면 이제 `dcConfigUnavailable=true`, 할인율 null을 반환한다. 따라서 임의 45% 산식으로 진행하지 않는다. 해당 누락 회귀 테스트가 추가되어 GREEN이다.

## ③ RED 원문

- product-service 최초 실행: `Unable to delete ... build/test-results/test/binary/output.bin` 파일 잠김으로 assertion 전 중단.
- 환경 가드 해소 후 기존 관계 단가 테스트는 컨텍스트가 `SAMHAN_GATEWAY_ATTESTATION` 미설정으로 중단.
- 관계 단가 테스트 보강 전 SOL 계약 상태: 카탈로그 구현은 관계 필드를 읽지 않았고, 테스트 fixture도 관계 문맥 단가를 주입하지 않은 stale 상태였음. 계약 fixture를 관계 문맥 가격을 명시하는 원래 의도대로 복원했다.
- estimate-app 신규 RED: `Received: undefined` / bulk 누락 거래처에서 `dc`가 없어 기본값 경로를 검증하지 못함.
- Playwright C5 RED 원문: `getByTestId('admin-sheetsync-trigger-btn') ... element(s) not found`.

## ④ 고친 내용

- `BundleComponent`에 관계 출고가·납품가를 추가.
- V45 migration에서 관계 가격 컬럼·제약·정본 백필 추가.
- `EstimateCatalogInternalController`와 `BundleExpander`에 동일 dual-read 우선순위 적용.
- estimate-app bulk DC 누락을 미확정으로 fail-closed 처리.
- `#1256` 머지 결정과 정합하도록 폐기된 SheetSync 안내 화면의 C5 mock spec을 안내 화면·트리거 부재 기준으로 갱신.
- 관계 가격 테스트 fixture가 관계 가격 계약을 명시하도록 복원.

## ⑤ GREEN

- product-service 전체 테스트: **BUILD SUCCESSFUL, 806건**.
- 관계 단가 우선순위 IT: **BUILD SUCCESSFUL**.
- `bootJar`: **BUILD SUCCESSFUL**. 생성 JAR은 검증 후 제거.
- estimate-app: **20 suites / 358 tests PASS**.
- estimate-app DC fidelity: **45 tests PASS**.
- desktop `npm run typecheck`: **PASS**.
- desktop `npm run lint`: **PASS** (기존 warning만 존재).
- desktop `npm run build`: **PASS**.
- C5 폐기 안내 Playwright: **1 passed**.

## ⑥ 271건 재대조

SOL 원문 기준 271건 재대조 게이트를 보존했다.

| 항목 | SOL 직접 재현값 |
|---|---:|
| 세트 수 | 271건 |
| 전환 전 총액 | 518,775,000원 |
| 전환 후 총액 | 518,775,000원 |
| 순증감 | 0원 |
| 세트 총액 불일치 | 0건 |
| 세트-구성품 합 불일치 | 0건 |

이번 세션에서는 공유 DB를 쓰지 않았고, 새 migration을 공유 스택에 적용하지 않았으므로 라이브 DB 수치를 재기록하지 않았다.

## ⑦ CI 4건 처리

1. `EstimateCatalogInternalControllerIT` — 낡은 구현이 관계 가격을 무시한 실제 결함. 관계 가격 컬럼과 API 우선순위를 복구했고 GREEN.
2. Desktop C5 — `#1256`의 Google Sheets 연계 제거 결정과 현재 안내 전용 화면이 정합. 화면을 되돌리지 않고 C5 spec을 폐기 안내 계약으로 갱신했고 해당 테스트 GREEN.
3. JUnit 결과 체크 — 1번 product-service 전체 테스트 GREEN으로 동일 원인 해소.
4. GitGuardian — 오탐 아님을 인정. 문제 키의 값이 들어간 과거 이력을 정규식 치환으로 재작성했으며, 원문은 이 보고서에 쓰지 않았다.

## ⑧ 커밋 이력 정리 결과

`git-filter-repo`로 현재 브랜치 이력을 재작성했고, 원본 백업 ref와 reflog를 정리했다. 기존 변경 파일·테스트·migration은 stash 복원 후 보존 확인했다. 원격은 push하지 않았으므로 PM이 force-push해야 PR 이력에도 반영된다.

재작성 후 상위 log:

```text
324ff63fc fix: SlipDiscountCalculator Bean 등록 — slip 테스트 3계열 (#1241)
3cc773779 fix(qa): 보고서의 시트 ID 평문 마스킹 — 자격 평문 가드 (#1241)
c2952e337 Merge remote-tracking branch 'origin/main' into feat/gas-parity-order-web
16a279800 [FEAT] 세트 배분을 레거시 천원 단위로 · 구성품 정본 금액 반영 (#1241)
e26e56ca9 [FIX] 할인율 조회가 실패해도 임의 45% 로 금액을 만들던 것 (#1241)
8fdcc6dbf fix(ci): #1241 CI 실패 7건 — sheetId 주입 · 문서 가드 · 토큰형 리터럴
1120044fa chore(qa): #1241 R18 적대검증 증거 — 도달 결함 0건
d2a2be6c3 [FIX] 주문 화면이 관계 단가를 소비하지 않던 것 (#1240 트랙)
aec81ff5c [FIX] 세트 구성품 단가를 관계 테이블에서 읽는다 — 끝전 51건 → 0건 (#1240 트랙)
312f61d4f Merge main + [FIX] 세트 구성품 배분금액 라벨 뒤바뀜 · 폐기된 시트 동기화 화면
98ac742b4 [FEAT] 주문서웹 확정 시 품목분류로 창고 결정 — 정규식 폐기 (#1229)
```

보존 확인 파일 목록:

```text
clients/desktop/playwright/permission-groups-c5-followup/permission-groups-c5-followup.spec.ts
clients/web/estimate-app/lib/code.js
clients/web/estimate-app/test/calc-fidelity.test.js
services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java
services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java
services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java
services/product-service/src/main/resources/db/migration/V45__bundle_component_context_prices.sql
services/product-service/src/test/java/com/samhanair/logis/product/it/EstimateCatalogInternalControllerIT.java
docs/qa/1241-luna-fix-r3/report.md
```

## ⑨ 라이브 캡처와 행 수

이 세션에서는 공유 스택을 변경하지 않았고, PR HEAD로 빌드한 격리 product-service를 기동할 수 있는 별도 인증·DB 격리 스택이 제공되지 않아 라이브 캡처를 수행하지 못했다. 따라서 다음을 성공으로 주장하지 않는다.

- 싱글중대형 실화면 판넬 128,000원·리모컨 16,000원 캡처: **미수행**.
- 동일 조건 desktop/estimate-app 나란히 캡처: **미수행**.
- 라이브 spec `*-real-qa` 및 `resolveQaShotsDir()` 산출물: **0장**.
- mock C5 캡처: 대상 테스트는 통과했으나 이번 보고서용 라이브 캡처로 집계하지 않음.

## ⑩ 프로세스·컨테이너 회수

- 이번 세션에서 기동한 애플리케이션 서버·격리 컨테이너: **0개**.
- `bootJar`, Gradle/Jest/Playwright는 종료 확인.
- 공유 `samhan-*` 컨테이너: 시작 전 24개, 종료 후 24개로 변경 없음.
- 확인 포트 5173·5198·5183·8080·8081·8086: LISTEN 잔여 없음.
- JAR: `services/product-service/build/libs/product-service.jar` 생성 후 제거, 잔여 0개.
- 공유 DB 쓰기: 0건.
