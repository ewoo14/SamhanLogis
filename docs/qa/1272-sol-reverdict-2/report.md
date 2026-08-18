# PR #1272 CODEX SOL 재판정 2회차

검증일: 2026-08-18 KST  
판정: **실사용 화면 도달 결함 0건. 단, CI 3개 실패로 현재 머지 불가.**

## ① 검증 SHA

- 지시 SHA 및 로컬 HEAD: `f11e8c86e545cc83b6a3fdcfbc50fdda8d989b4f`
- 게시 직전 PR head: `f11e8c86e545cc83b6a3fdcfbc50fdda8d989b4f`
- 브랜치: `feat/category-settings-migration`
- 브랜치 JAR 직접 빌드: Eureka/Gateway/product-service `BUILD SUCCESSFUL`
- 공유 `product_db`는 `pg_dump -Fc`로 읽기만 했고, 모든 쓰기는 격리 PostgreSQL `sol1272r2-pg`에서만 수행했다.

## ② 결함1 — 카테고리별 격리 실측

실제 견적품목 화면에서 `COMMERCIAL_MULTI / AM260AXVHHH1SY / AM100AXVHHH1`을 직접 저장하고, 실제 종합견적 화면을 전후로 열었다.

| 축 | 저장 전 | 저장 후 |
|---|---|---|
| 상업멀티 대상 | `FOLLOW_SET / OUTDOOR / 옵션 없음` | `FIXED / ACCESSORY / SOL1272-R2-COMM-FIXED` |
| 싱글 sentinel | `AC023CS1DBC1SY / AC023CN1DBC1 / FOLLOW_SET / INDOOR / 기본` | 전 필드 동일 |
| 종합견적 상업멀티 기본행 | 310 | 310 |
| 종합견적 싱글 기본행 | 133 | 133 |
| 종합견적 싱글 구성행 | 718 | 718 |
| 두 화면 DOM 합계 | 1,161 | 1,161 |

세트 수량을 실제 화면 입력으로 2로 바꾼 뒤 화면이 사용하는 전개 함수를 실행했다.

- 저장 전 상업멀티 `FOLLOW_SET`: 대상 구성품 수량 2.
- 저장 후 상업멀티 `FIXED`: 대상 구성품 수량 **1**.
- 변경하지 않은 싱글 `FOLLOW_SET`: 대상 구성품 수량 **2**.

따라서 저장값은 카탈로그 소비 및 종합견적 전개에 반영됐고, 다른 실제 카테고리 sentinel은 변하지 않았다.

중요: fix 보고서의 310행/1,161행은 저장으로 늘어난 행이 아니다. **310은 상업멀티 기본 카탈로그 행 수이고, 1,161은 상업멀티 310 + 싱글 기본 133 + 싱글 숨은 구성 718의 합계**다. 전후 행 수는 완전히 동일하다.

동일 부모 세트를 두 카테고리에서 직접 비교하는 축은 현재 복원 데이터에 `multi_category_parents=0`이라 실데이터로 만들 수 없었다. 임의 exposure 주입 결과, 구성품 소비 API가 부모의 단일 `product_category`로 먼저 분기한다는 점도 확인했다. 합성 fixture는 최종 판정 근거에서 제외하고 ⑩ 미검증에 남겼다.

## ③ 결함2 — 게이트웨이 200 및 라우트 순서 영향

서비스 직접 호출이 아니라 브랜치 Gateway `http://127.0.0.1:18084`를 실제 통과했다.

| 경로 | 결과 |
|---|---:|
| `/api/v1/products/AM260AXVHHH1SY/component-settings?estimateCategory=COMMERCIAL_MULTI` | 200, 2행 |
| `/api/v1/products/AM260AXVHHH1SY/components` | 200 |
| `/api/v1/products/AM260AXVHHH1SY/specs` | 200 |
| `/api/v1/products?estimateCategory=COMMERCIAL_MULTI&page=0&size=1` | 200 |
| `/api/v1/products/AM260AXVHHH1SY/component-settings/extra?...` | 404 |

신규 exact no-strip 라우트는 정상 200이고, 앞뒤 기존 product 경로도 200이다. 더 긴 suffix는 신규 라우트가 잡아먹지 않고 404라서 라우트 순서에 따른 인접 경로 가림은 재현되지 않았다.

## ④ 1차 판정 6가지 재현

| 항목 | 직접 재실측 |
|---|---|
| 수량 변경 | 세트 수량 1·2·7 각각 변경 부모 `0/343` |
| V47 이전 | 설정 `1,584행 / 343세트` |
| exposure 전행 차이 | V45 원본과 V47 DB 모두 867행, 체크섬 `6c8eb1db12f2a39b19a1bc4a360a215b`, 차이 0 |
| 미매핑 fallback | 활성 구성행 중 설정 없는 행 14 |
| 옵션 충돌 | 2쌍 그대로 보존: `COMMERCIAL_MULTI/AM100AXVHHR1` = NULL 기본 4부모 + `S6-1111-MANUAL` 기본 1부모, `SINGLE_SET/AWR-WE13N` = 기본 기본 3부모 + 유선 비기본 62부모 |
| fresh migration | 빈 `product_fresh`에서 47개 검증, V1→V47 47개 적용, v47 기동 성공 |

추가로 공유 V45 복원본은 브랜치 product-service 기동 시 V46·V47 두 개를 실제 적용해 v47이 됐다.

## ⑤ 웹 노출 무변화

- V45 원본과 V47 적용본의 `product_estimate_exposure`는 모두 867행이며 전행 체크섬도 동일하다.
- 카테고리별 활성 exposure: `COMMERCIAL_MULTI 416 / HOME_MULTI 123 / LEGACY 40 / SINGLE_SET 288`.
- 종합견적 실제 DOM은 저장 전후 `상업멀티 310 / 싱글 기본 133 / 싱글 구성 718 / 합계 1,161`로 변화 0이다.
- 설정 전용 354쌍을 위한 신규 exposure 삽입은 없었다.
- 주문서웹 bootstrap은 직접 호출했으나 공유 Gateway가 HTTP 503을 반환했다. 주문서웹 실제 UI 품목 수는 미검증이며 결함 0으로 세지 않았다.

## ⑥ 기초품목 손실 없음

실제 기초품목 수정 화면 `AM260AXVHHH1SY`를 열어 확인했다.

- 구성품 2행.
- `수량 동기화` 편집기 0, `품목구분` 편집기 0, `옵션` 편집기 0.
- 구성 관계·기본수량은 남아 있고 `고정금액` 편집기 2개도 존재.
- 가격 영역의 product `deliveryPrice` 필드는 남아 있으며 화면 값은 `13,299,110`이다(화면 라벨 `배송가`).
- 판매가·매입가·출고가·배송가 영역을 직접 확인했다.

따라서 제거 대상 3종 외에 기초품목의 납품가 대응 필드가 사라진 화면 결함은 재현되지 않았다.

## ⑦ 마이그레이션 번호 3중 확인

- 이 브랜치 product-service 최대: `V47__category_component_settings.sql`.
- 최신 `origin/main` 최대: V46.
- GitHub REST로 열린 PR 13개 전체 파일 재조회: product-service migration 추가는 PR #1272의 V47 한 개뿐. 다른 열린 PR의 V47 충돌 없음.

첫 GraphQL 조회는 HTTP 503이어서 폐기했고, 위 수치는 REST 재조회 성공 결과만 사용했다.

## ⑧ 커밋 캡처 검증

커밋된 fix-round1-live PNG 3장을 원본 해상도로 직접 열었다.

1. `01-before-category-setting-real-qa.png`: 설정 2행, 첫 행 `세트 따라감/실외기`, 주장과 일치.
2. `02-after-category-setting-real-qa.png`: 설정 2행, 첫 행 `고정/부속/SOL1272-FIX-LIVE-P...`, 주장과 일치.
3. `03-comprehensive-estimate-after-save-real-qa.png`: 빈 입력폼이 아니라 실제 상업멀티 카탈로그이며 대상 `AM260AXVHHH1SY` 포함. PNG viewport에서 직접 보이는 데이터 행은 15행이다.

증거 무결성 한정: 3번 PNG 한 장만 열어서 1,161행을 셀 수는 없다. 1,161은 별도 Playwright DOM 계측값이다. 따라서 fix 보고서의 “PNG를 직접 열어 실제 1,161행 확인” 표현은 과장됐지만, 빈 화면을 세트상세라고 주장한 사례는 아니며 이번 재실측 DOM 1,161과는 일치한다.

## ⑨ 이번 재판정 스크린샷

모두 `resolveQaShotsDir()` 경유 및 `QA_SHOTS_DIR` 명시 경로다. 각 PNG를 원본 해상도로 직접 열었다.

| 파일 | 직접 확인 내용 | 행 수 |
|---|---|---:|
| `docs/qa/1272-sol-reverdict-2/screenshots/01-commercial-fixed-saved-real-qa.png` | 상업멀티 저장 후 모달 | 설정 2행 |
| `docs/qa/1272-sol-reverdict-2/screenshots/02-single-unchanged-real-qa.png` | 변경하지 않은 싱글 sentinel 모달 | 설정 7행 |
| `docs/qa/1272-sol-reverdict-2/screenshots/03-commercial-set-qty-two-real-qa.png` | 종합견적 상업멀티 대상 세트 수량 2 입력 | viewport 데이터 15행, 전체 기본 310행 |
| `docs/qa/1272-sol-reverdict-2/screenshots/04-single-follow-set-remains-two-real-qa.png` | 종합견적 싱글 sentinel 수량 2 입력 | 전체 기본 133 + 구성 718행 |
| `docs/qa/1272-sol-reverdict-2/screenshots/05-basic-product-boundary-real-qa.png` | 기초품목 편집 경계·가격 영역 | 구성품 2행 |

PNG 3·4는 수량 입력이 보이는 실제 화면이고, 구성품 계산 결과 1·2는 같은 Playwright 실행 로그의 전개 함수 assertion으로 확인했다.

## ⑩ 미검증 축

- 동일 부모 세트가 둘 이상의 estimate category에 실제로 노출된 상태의 화면 간 격리: 현재 데이터 0건이라 실데이터 재현 불가. 다른 실제 카테고리 sentinel의 불변은 확인했다.
- 주문서웹 실제 UI 품목 수: `/api/v1/partner-orders/bootstrap` HTTP 503으로 미도달. exposure 전행 무변화까지만 확인했다.

위 두 축은 결함 0으로 환산하지 않았다.

## ⑪ CI

로컬 fresh 검증:

- 최종 Playwright 실제 실행: **2/2 통과**(게이트웨이 + 저장/종합견적/기초품목).
- fix 집중 Gradle: product-service IT + api-gateway IT, `BUILD SUCCESSFUL`.
- estimate-app Jest: **21 suite / 360 test 전부 통과**.
- 브랜치 JAR 3개 bootJar: `BUILD SUCCESSFUL`.

GitHub head `f11e8c86e`의 check-runs 48개는 **45 success / 3 failure**다.

1. `Frontend Desktop (typecheck + lint + build)`: 제거된 기초품목 3종 UI(`블랙`, `형상`)를 여전히 기대하는 `ProductFormPage.test.tsx` 1건 실패.
2. `빌드 + 테스트 (user+product+inventory+logging)`: `ProductPermissionControllerIT` 컨텍스트의 `NoSuchBeanDefinitionException`으로 product 권한 IT 다수 실패.
3. `JUnit 테스트 결과 (user+product+inventory+logging)`: 위 backend 실패의 결과 수집 check 실패.

기능 라이브 결과와 별개로 CI는 green이 아니다.

## ⑫ 최종 판정

**현재 머지 불가 — 실사용 화면 도달 결함 0건, CI 실패 3개.**

- 1차 결함1은 직접 화면 저장 → 종합견적 재개방 → 카탈로그 필드 및 수량 전개로 닫힘을 확인했다.
- 1차 결함2는 실제 브랜치 게이트웨이 200과 인접 경로 200/비매칭 suffix 404로 닫힘을 확인했다.
- 사용자 화면에서 재현 가능한 신규 기능 결함은 발견하지 못했다.
- 단, CI 3개가 red이므로 머지 조건을 충족하지 못했다.

## ⑬ 프로세스 회수

- 회수 포트: 5175, 5183, 18084, 18085, 18095, 18761 모두 CLOSED.
- 격리 컨테이너 `sol1272r2-pg`: 제거, 잔여 0.
- 공유 `samhan-*` 컨테이너: **24개 그대로 유지**.
- 타 작업 컨테이너 `codex1264-live-pg`, `codex1266-r2-pg`: 건드리지 않음.
- auth-service 격리 기동 없음.
- 공유 DB write 없음.
- git add/commit/push 및 제품 코드 수정 없음.

