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

기존 resolver를 임시 복원한 뒤 새 양방향 검증을 실행했다. 테스트 러너는 의존성 부재로 실행되지 않아 동일 assertion을 Node 직접 실행으로 검증했다.

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

직접 실행한 양방향 resolver 검증:

```text
PASS legacy resolver bidirectional
```

추가 정적 검증:

- `index.ejs`: `변동단가` 라벨 4개, `인상 전 단가` 라벨 0개
- 가격 선택 조건: unchecked baseline 분기 확인
- JS `node --check`: 변경한 JS 3개 통과
- `git diff --check`: 통과

저장소 의존성 부재로 다음 명령은 실행되지 않았다.

- estimate-app Jest: `jest is not recognized`
- desktop typecheck: `npm ci` 및 design-system build 필요
- desktop lint: `eslint is not recognized`
- desktop build: `electron-vite is not recognized`

## ⑨ 라이브 캡처

캡처 스크립트는 `resolveQaShotsDir()`를 거쳐 `docs/qa/price-variant-canon/estimate-app-real-qa/`를 사용하도록 갱신했다. 라벨·초기 해제 상태 검증도 `변동단가` 및 4개 기본값 false로 갱신했다.

그러나 이번 세션에서는 라이브 캡처를 생성하지 못했다. 공유 게이트웨이와 product-service는 정상 응답했지만 estimate-app/desktop 렌더러 포트(5195)가 열려 있지 않았고, 두 클라이언트의 Playwright/Vite 의존성이 설치되어 있지 않았다. 따라서 켬/끔 금액 캡처는 PM 실행 환경에서 후속 수행이 필요하다.

## ⑩ order-app 불변 확인

`git diff --name-only -- clients/web/order-app services/order-service services/partner-order-service` 결과가 비어 있다. 납기일·`effective_date` 자동 전환 코드는 변경하지 않았다.

## ⑪ 프로세스 회수

이번 세션에서 새 프로세스·격리 컨테이너를 기동하지 않았다. 공유 스택은 조회 당시 24개 컨테이너가 모두 `healthy`였고, 공유 DB에 쓰기 쿼리를 실행하지 않았다. 테스트 빌드가 생성한 `clients/desktop/legacy-assets/estimate/index.fallback.html`은 명시적으로 회수했다. 잔여 기동 프로세스/격리 컨테이너: 0개.
