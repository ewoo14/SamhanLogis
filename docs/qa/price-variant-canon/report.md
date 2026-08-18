# 변동단가 옵션 정본화 구현 보고서

## ① 영향 규모 수치

공유 `product_db`를 읽기 전용 SQL로 조회했다. 대상은 `products.is_deleted = false`, `status = ACTIVE`이고 `price_history.effective_date = 2000-01-01` baseline이 있는 품목이다.

| 기준 | 대상 품목 | 변동 전/현재 금액 차이 |
|---|---:|---:|
| 전체 | 1,019 | 9 |
| HOME_MULTI | 106 | 0 |
| COMMERCIAL_MULTI | 321 | 0 |
| OLD | 37 | 0 |
| SINGLE_PART | 346 | 7 |
| SINGLE_SET | 209 | 2 |

차이 9건 중 출고가만 다른 건 7건, 납품가만 다른 건 2건이다. 대표 5건은 다음과 같다.

| 카테고리 | 모델 | 품목 | 변동 전 출고가 → 현재 출고가 | 변동 전 납품가 → 현재 납품가 |
|---|---|---|---:|---:|
| SINGLE_PART | AC060CXAPBH1 | 360 CST UV 실외기 | 1,254,000 → 1,331,000 | 0 → 0 |
| SINGLE_PART | AC072CXAPBH1 | 360 CST UV 실외기 | 1,276,000 → 1,540,000 | 0 → 0 |
| SINGLE_PART | AC110CXAPBH1 | 360 CST UV 실외기 | 1,342,000 → 2,156,000 | 0 → 0 |
| SINGLE_PART | AC110CXAPHH1 | 360 CST UV 실외기 | 1,342,000 → 2,156,000 | 0 → 0 |
| SINGLE_PART | AC130CXAPBH1 | 360 CST UV 실외기 | 1,644,500 → 2,354,000 | 0 → 0 |

따라서 의미를 뒤집으면 실제 화면 금액이 바뀌는 대상은 현재 데이터 기준 9건이다.

## ② RED 원문

기존 resolver를 임시 복원한 뒤 새 양방향 검증을 실행했다. 당시 RED 원문은 다음과 같다.

```text
FAIL legacy resolver expected unchecked=baseline and checked=current, got {"unchecked":{"releasePrice":200000,"deliveryPrice":150000},"checked":{"releasePrice":200000,"deliveryPrice":150000}}
```

실패 원인은 기존 resolver가 체크 인자를 무시하고 현재가만 반환했기 때문이다.

## ③ 명칭 통일 범위

- `clients/web/estimate-app/views/index.ejs`의 4개 체크박스 라벨을 모두 `변동단가`로 변경했다.
- estimate-app 활성 코드·테스트·QA 스크립트와 가격 스케줄 관리 화면의 표시 문구를 정본 명칭에 맞췄다.
- `order-app` 파일은 변경하지 않았다.
- 지정된 전수조사 원문 `docs/dev-reports/2026-08-17-price-variant-option-recon/report.md`는 이 워크트리와 `origin/main` 양쪽에 존재하지 않았다.

## ④ 기본값 마이그레이션과 번호 대조

`services/product-service/src/main/resources/db/migration/V46__canon_price_variant_defaults_off.sql`을 추가했다. 활성 4개 카테고리 행의 `default_pre_change`를 모두 `FALSE`로 정규화한다.

- 현재 워크트리: V43이 최신
- `origin/main`: V43이 최신
- 열린 PR #1241 브랜치: V44, V45 사용 중
- 신규 번호: V46

## ⑤ 의미 뒤집기 구현

- 체크 해제: `price_history`의 2000-01-01 baseline
- 체크: `products` 현재 단가
- 홈멀티·상업멀티·싱글의 출고가/납품가 선택 조건을 `!checked` baseline으로 변경했다.
- 구형도 같은 의미를 사용하도록 resolver를 수정했다.

## ⑥ 구제품 no-op 해소

`oldProducts()`가 기존 현재가와 함께 `/price-baseline` 결과를 `preChangePrice`, `preChangeSheetPrice`로 주입한다. 구형 resolver는 체크 해제 시 이 값을 사용하고 체크 시 현재 `price`, `sheetPrice`를 사용한다. baseline이 없는 행은 현재가로 안전하게 fallback한다.

## ⑦ 카테고리별 기본값 설정 UI

새 테이블·새 API는 만들지 않았다. 기존 `/products/price-schedule` 화면과 GET/PUT API를 그대로 재사용하고, `EstimateItemsCatalogPage`에 `변동단가 기본값 설정` 진입 버튼을 추가했다. `products.price-schedule` VIEW 권한이 있을 때만 표시된다.

## ⑧ GREEN

의존성 설치 후 실행한 GREEN:

```text
PASS legacy resolver bidirectional
PASS 20개 suite / 356개 테스트
```

실행 결과:

- estimate-app Jest: 20개 suite, 356개 테스트 통과
- desktop `npm run typecheck`: 통과
- desktop `npm run lint`: 오류 0개, 경고 196개
- desktop `npm run build`: 통과
- product-service `./gradlew :services:product-service:bootJar`: 통과
- V46을 임시 복제 DB에 적용한 product-service 격리 기동: 통과
- `index.ejs`: `변동단가` 라벨 4개, `인상 전 단가` 라벨 0개
- `git diff --check`: 통과

desktop lint의 196개 경고는 기존 경고이며 오류는 없었다. build의 source/font/dynamic import 경고도 exit code 0으로 완료되었다.

## ⑨ 라이브 캡처

공유 스택은 로그인 HTTP 200 및 healthy 컨테이너 24개 상태를 유지했다. product-service만 임시 복제 DB에 연결해 18084 포트로 격리 기동했고, auth-service는 공유 인스턴스를 사용했다.

최종 증거는 모두 `resolveQaShotsDir()`가 반환한 실 QA 디렉터리 아래에 저장했다. `_local` 임시 캡처 3장은 삭제했다.

| 범주 | 행 수 | 끔 | 켬 | 변화 행 | 캡처 |
|---|---:|---|---|---:|---|
| 홈멀티 | 107 | 해제 | 체크 | 0 | `home-real-qa/home-off-real-qa.png`, `home-on-real-qa.png` |
| 상업멀티 | 310 | 해제 | 체크 | 0 | `commercial-real-qa/commercial-off-real-qa.png`, `commercial-on-real-qa.png` |
| 싱글중대형 | 851 | 해제 | 체크 | 6 | `single-real-qa/single-off-real-qa.png`, `single-on-real-qa.png` |
| 구형 | 39 | 해제 | 체크 | 0 | `old-real-qa/old-off-real-qa.png`, `old-on-real-qa.png` |

모든 캡처에서 체크박스 라벨은 `변동단가`였다. 싱글의 대표 변화는 `AP145BAPPHH2S` 납품가 1,980,000원 → 1,890,000원, `AR06D1150HZS` 납품가 370,000원 → 360,000원이다. 싱글 6행은 원 품목 2건과 세트 구성 렌더 행 4건을 포함한다. 홈멀티·상업멀티는 영향 규모 0건이므로 켬/끔 금액이 동일한 것이 정상이며, 구형도 현재 데이터 차이 0건으로 금액이 동일하다.

견적품목 화면 진입점은 다음에 캡처했다.

- `estimate-items-real-qa/estimate-items-price-schedule-entry.png`: `변동단가 기본값 설정` 버튼 노출

## ⑩ order-app 불변 확인

`git diff --name-only -- clients/web/order-app services/order-service services/partner-order-service` 결과가 비어 있다. 납기일·`effective_date` 자동 전환 코드는 변경하지 않았다.

## ⑪ 프로세스 회수

product-service, estimate-app, desktop Vite를 검증 중 기동했으며 모두 종료했다. product-service 격리용 임시 복제 DB도 삭제했고 공유 `product_db`에는 쓰지 않았다. 생성한 JAR·desktop build 산출물·로그·`_local` 증거를 회수했다. 공유 스택은 중단하거나 변경하지 않았다. 잔여 기동 프로세스/격리 컨테이너: 0개.

## ⑫ 추가 검증 결과 및 캡처 목록

- ① 영향 규모: 전체 1,019건 중 변동 전/현재 금액 차이 9건. HOME_MULTI 0, COMMERCIAL_MULTI 0, OLD 0, SINGLE_PART 7, SINGLE_SET 2.
- ② RED: 기존 구제품 resolver가 체크 인자를 무시해 끔/켬 모두 현재가를 반환했다.
- ③ 명칭: 네 화면 라벨 4개 모두 `변동단가`.
- 라이브 상태: 네 화면 초기 체크 모두 해제, 켬 상태는 모두 체크. 홈멀티·상업멀티·구형 변화 0행, 싱글 변화 6렌더 행.
- 라이브 금액: `AP145BAPPHH2S` 1,980,000원 → 1,890,000원, `AR06D1150HZS` 370,000원 → 360,000원.
- 캡처 디렉터리: `home-real-qa`, `commercial-real-qa`, `single-real-qa`, `old-real-qa`, `estimate-items-real-qa`.
- 견적품목 진입점: `estimate-items-price-schedule-entry.png`에서 `변동단가 기본값 설정` 버튼을 확인했다.
