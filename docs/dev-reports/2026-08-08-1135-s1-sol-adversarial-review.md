# PR #1135 1차 적대검증 — LIKE escape 전수(축 A)

- 검증 HEAD: `d2e5a5d312407ce26a176e8bd114c235431ed570`
- 비교 기준: `HEAD^` (`e5a239646`)
- 판정: **중단 · 라이브 판정 불가**

## 0. 중단 사유 — 공유 배포본이 PR HEAD가 아니다

요청된 라이브 QA의 선행조건이 충족되지 않았다. 공유 Docker 스택은 재기동하지 않았으며, 읽기 전용으로 이미지 생성 시각과 JAR 내부 클래스를 확인했다.

| 컨테이너 | 이미지 생성 시각(UTC) | 컨테이너 시작 시각(UTC) | HEAD 코드 존재 여부 |
|---|---:|---:|---|
| `samhan-auth-service` | 2026-08-03 14:34 | 2026-08-07 17:57 | 없음 — `ApprovalLineApproverService.class`에 `escapeLikeLiteral` 없음 |
| `samhan-dc-config-service` | 2026-08-05 17:31 | 2026-08-07 17:57 | 없음 — `PartnerDcConfigsController.class`에 `escapeLikeLiteral` 없음 |
| `samhan-product-service` | 2026-08-07 15:11 | 2026-08-07 17:57 | PR 커밋(2026-08-08 00:11 UTC) 이전 이미지 |
| `samhan-slip-service` | 2026-08-08 00:12 | 2026-08-08 00:13 | 없음 — JAR 안 `SlipService.class` 시각이 2026-08-07 21:27이고 HEAD의 `escapeLikeLiteral` 없음 |

따라서 실 GUI/API에서 `%`·`_`·`\`·정상 검색어를 실행해도 PR #1135를 검증하는 것이 아니다. 지시대로 라이브 검색, 실데이터 건수 비교, headless Playwright, 스크린샷 캡처를 시작하지 않았다. `resolveQaShotsDir`을 우회한 캡처도 만들지 않았다. PM 재배포 후 이 축은 처음부터 다시 실행해야 한다.

## 1. 1번 각도 — 정상 검색 차단 여부

**판정 불가.** 배포본 불일치로 다음 항목은 실행하지 않았다.

- `%` 또는 `_`가 실제 이름에 든 데이터의 리터럴 검색
- 평범한 한글·영문·숫자 검색의 전/후 건수 비교
- 부분 일치, 앞뒤 공백, 대소문자 불변성
- 백슬래시 입력의 DB 실제 매칭
- 발화 데이터가 없을 때 관리자 화면/API를 통한 생성 가능성 확인

DB 직접 쓰기와 직접 INSERT는 하지 않았다.

## 2. 2번 각도 — `12곳 · 67곳` 증거 무결성

### 2.1 14개 서비스 범위

Samhan Public 14개 서비스로 다음을 고정하고 Java main 소스를 `git ls-files`/`git grep`로 훑었다.

`accounting`, `auth`, `dashboard`, `dc-config`, `groupware`, `inventory`, `logging`, `notification`, `partner-auth`, `partner-order`, `partner`, `product`, `slip`, `user`.

`api-gateway`, `eureka-server`, 독립 운영 단위인 `arologis-service`는 14개 서비스 집계에서 제외했다.

표현 형태는 native SQL/JDBC, JPQL `@Query`, Criteria/`Specification`, QueryDSL로 나눴다. QueryDSL 사용은 0건이었다.

### 2.2 `67곳`은 재현되지 않는다

`HEAD^`의 Java main 소스에서 같은 줄에 `LIKE ... ESCAPE`가 명시된 실행 SQL 라인을 세면 **66줄**이다.

| 서비스 | `LIKE ... ESCAPE` 라인 수 |
|---|---:|
| accounting | 13 |
| inventory | 3 |
| partner-order | 8 |
| partner | 16 |
| product | 6 |
| slip | 12 |
| user | 8 |
| 합계 | **66** |

Criteria의 `cb.like(..., '\\')`까지 더하면 67이 아니라 그보다 여러 건 많아진다. 반대로 countQuery 중복을 제거하거나 repository method 단위로 접으면 66보다 작아진다. PR 본문과 구현 보고서에는 67의 집계 단위·제외 규칙·원문 목록이 없어 **67을 재현할 수 없다.** 이는 요청에서 지정한 증거 무결성 예외에 해당한다.

### 2.3 `12곳`도 “사용자 입력이 LIKE로 흐르는 경로” 축에서는 재현되지 않는다

PR이 바꾼 `HEAD^`의 조건을 세는 방식에 따라 값이 달라진다.

- 변경된 SQL의 원문 `LIKE` 라인: 16줄
- countQuery 중복을 접고 검색 필드 조건을 세면: 12조건
- 여기에 PR이 함께 바꾼 `SlipService.buildListSpec` Criteria `driverPhone` 조건을 포함하면: 13조건
- 사용자 입력 진입점→분기→query를 하나의 경로로 세면: 9경로

12는 “countQuery 중복은 접되 같은 query의 검색 필드는 각각 세고, Criteria 변경은 제외”할 때만 나온다. 이는 요청된 경로 축도, 파일/메서드 축도 아니다. 따라서 **PR 본문의 `ESCAPE 없는 LIKE 12곳` 단정은 그 집계 규칙 없이는 재현 불가**다.

### 2.4 HEAD에서 확인한 표현 형태별 잔여 지점

- native/JPQL에서 `ESCAPE` 없는 실행 SQL은 accounting의 고정 `mapping.%`, accounting batch 번호 시스템 prefix 2곳, inventory transfer 번호 시스템 prefix 1곳이었다. 정적 호출 형태상 사용자 free-text가 아닌 고정/시스템 prefix다.
- Criteria의 escape-char overload가 없는 `SlipQueryService.buildQuerySpec` 내 `cb.like` 6개가 남아 있으나, 이 private method의 호출자는 0건이다. 현재 사용자 입력은 `listForQuery`→native `searchIncludingDeleted`로 흐르므로 도달 불가 dead path다.
- partner-order의 native와 Criteria 경로에는 각각 SQL `ESCAPE`와 `cb.like(..., '\\')`가 있다.
- QueryDSL 표현은 발견되지 않았다.

단, `67` 원문 목록이 없으므로 “기존 적용 67개 경로 전부의 서비스 escape↔repository ESCAPE 짝이 맞는다”는 전수 판정은 내리지 않는다.

## 3. 3번 각도 — 회귀 울타리의 실제 도달성

### 3.1 서비스 계층을 직접 겨냥하는 테스트

다음 신규 테스트는 mock repository에 전달되는 값이 `\\%\\_\\\\`인지 직접 단언한다. 해당 서비스/컨트롤러의 escape 제거 뮤테이션은 이 테스트에 도달한다.

- auth `ApprovalLineApproverService.searchUsers`
- dc-config `PartnerDcConfigsController.list`
- slip 사진감사 `SlipAttachmentService.listPhotoAudit`
- slip 견적이력 `QuoteSnapshotService.historyByCustomer`
- slip 외부기사 `ExternalCarrierService.search`
- slip 2인자 `SlipService.searchBySlipNo(q, limit)`

product에는 기존 helper 단위 테스트가 `%`·`_`·백슬래시·정상 문자열을 직접 단언하고, 기존 PostgreSQL IT가 `_` 리터럴 검색을 수행한다. 다만 이번 PR의 product 변경은 repository `ESCAPE` 추가뿐이므로, 기획서가 경고한 대로 그 한 줄 제거는 PostgreSQL 기본 escape 때문에 GREEN일 수 있다.

### 3.2 운영 경로를 비껴간 가짜 울타리

#### A. 전표 자동완성

운영 라우트 `SlipController`는 `searchBySlipNo(q, limit, slipTypes)` **3인자 overload**를 호출한다. 신규 테스트는 별도 구현인 **2인자 overload**만 호출한다.

- 테스트 도달: `SlipService.searchBySlipNo(String, int)`
- 운영 도달: `SlipController:223` → `SlipService.searchBySlipNo(String, int, Collection<SlipType>)`

두 overload는 각각 자기 메서드 안에서 별도로 `escapeLikeLiteral`을 호출한다. 운영 3인자 overload의 escape 한 줄만 제거하는 뮤테이션은 신규 테스트에 도달하지 않으므로 GREEN 구조다.

#### B. 전표 목록 `driverPhone` — native/Criteria 두 분기

`GET /slips`의 `driverPhone`은 `regionGroup` 유무에 따라 두 query 경로로 갈린다.

- `regionGroup` 없음: `listIncludingDeleted` native query. 기존 테스트는 정상 문자열 `1234`가 그대로 전달되는지만 본다. `escapeLikeNullable` 제거 뮤테이션은 GREEN 구조다.
- `regionGroup` 있음: `buildListSpec` Criteria. 기존 테스트는 `any(Specification)` 위임만 확인하고 predicate를 실행하지 않는다. `escapeLikeLiteral` 또는 `cb.like(..., '\\')` 제거 뮤테이션은 GREEN 구조다.

즉 PR이 새로 바꾼 두 `driverPhone` 운영 분기는 모두 서비스 계층의 `%`·`_`·백슬래시 방어를 실제로 고정하지 않는다.

### 3.3 뮤테이션 실행 여부

코드 수정 금지 지시 때문에 소스 뮤테이션을 실제 적용하지 않았다. 위 GREEN 판정은 호출 그래프와 Mockito 단언 대상을 대조한 도달성 판정이다. repository `ESCAPE` 제거만으로 RED를 주장하지 않았다.

## 4. 산출물·환경 위생

- 코드 수정, 커밋, push, DB 쓰기, Docker 재기동: 없음
- QA 스크린샷: 없음(배포 불일치로 Playwright 미실행)
- 이 라운드 신규 파일: `docs/dev-reports/2026-08-08-1135-s1-sol-adversarial-review.md` 1개

## 5. 이 라운드가 보지 않은 것

- PR HEAD 재배포 뒤의 실서버·실 GUI 검색 전부
- `%`·`_`가 실제 포함된 실데이터 존재 여부와 리터럴 검색 결과
- 정상 한글·영문·숫자의 전/후 건수, 부분 일치, 공백, 대소문자, 백슬래시 DB 동작
- 화면과 Excel export의 결과 일치
- 14개 서비스의 모든 기존 66개 `LIKE ... ESCAPE` 라인에 대한 호출자별 런타임 짝 검증
- 소스 변경을 동반하는 실제 서비스-layer mutation RED 실행
- headless Playwright와 `resolveQaShotsDir` 스크린샷
