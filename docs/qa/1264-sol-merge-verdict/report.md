# PR #1264 CODEX SOL 적대검증 머지 판정

검증 시각: 2026-08-17 KST  
검증 head: `4e3ce6ceb970f5f3247db2254b5f978a063613df`

## ① 회계전표 내용 검증(금액·allocation)

격리 PostgreSQL과 새로 빌드한 product/slip/accounting JAR로 직접 재현했다. Flyway 최종 버전은 product V45, slip V124, accounting V104였다.

- 원 전표: OUTBOUND 1건 4행, `수량 × VAT 포함 단가` 합계 **1,739,100**.
- 매출 회계전표: 1건, DRAFT, TAXABLE, 4라인, 총액 **1,739,100**.
- 원 전표: INBOUND 선택 1건 4행, `수량 × VAT 포함 단가` 합계 **1,739,100**.
- 매입 회계전표: 1건, DRAFT, TAXABLE, 4라인, 총액 **1,739,100**.
- 매출·매입 allocation은 각각 원 전표 1건의 1~4번 원천 라인을 회계전표 1~4번 라인에 일대일로 전액 배분한 것이다. 배분액은 순서대로 `641,480 + 963,040 + 118,580 + 16,000 = 1,739,100`이며, 네 건 모두 대응 회계라인 `line_total`과 일치했다.

금액 결함은 재현되지 않았다.

증거 무결성 정정:

- 원본 복제 직후 INBOUND 조회는 12행(3전표)이었다. 기존 QA와 같은 격리 정합화로 DRAFT 1전표(4행)를 CONFIRMED로 바꾼 뒤 **16행(4전표)**이 재현됐다. 기존 보고의 “입고 원천 4개 전표 상태 정합화”는 실제로는 **1전표·4행 정합화**다.
- 기존 캡처의 화면상 데이터행은 ① 4행, ② 8행, ③ 4행, ④ 4행이다. ②는 스크롤 영역 때문에 16행 전부가 한 캡처에 보이지 않는다. 실제 HTTP 조회로는 16행을 확인했다.
- ③과 ④ PNG는 SHA-256이 동일한 같은 이미지다. 한 화면에서 중복 버튼과 입력 상태를 함께 담은 증거로는 사용할 수 있으나 별도 시점 캡처 두 장은 아니다.

## ② 중복 차단 재현

- 같은 OUTBOUND 원천으로 매출 생성 1회차 HTTP 200, 2회차 HTTP 422 `SAS_OVER_ALLOCATION`.
- 같은 INBOUND 원천으로 매입 생성 1회차 HTTP 200, 2회차 HTTP 422 `SAS_OVER_ALLOCATION`.
- DB 최종 건수는 매출 1건·매입 1건으로 유지돼 데이터 중복 생성은 차단됐다.

도달 결함 1: 화면 차단 상태가 새로고침/재진입 뒤 유지되지 않는다.

- 성공 직후에는 컴포넌트 로컬 `accountingCreated`가 버튼을 `이미 생성됨`으로 바꾼다.
- 새로고침하면 로컬 Set이 초기화되고, 재조회 응답은 해당 4행 모두 `accountingPostedAt=null`이다.
- 버튼 disabled 조건이 `accountingPostedAt` 또는 로컬 Set뿐이므로 사용자는 다시 활성화된 `회계전표 생성` 버튼을 누를 수 있고, 그때 서버의 422 오류를 보게 된다.

즉, DB 중복은 막히지만 화면에서의 중복 생성 차단은 재진입 후 깨진다.

## ③ 잠김 유지

- 회계전표 생성 직후 같은 화면에서는 로컬 `accountingCreated`로 4행 입력이 비활성화된다.
- 그러나 새로고침 후 실제 slip 응답은 OUTBOUND 4행 모두 `amountEditable=true`, `accountingPostedAt=null`이었다.
- 이 상태에서 금액 저장 API를 호출하면 HTTP 409 `CONFLICT`와 “회계전표가 있는 전표의 금액은 수정할 수 없습니다.”로 서버가 변경을 막았다.

도달 결함 2: 사용자는 새로고침/재진입 후 다시 활성화된 금액 입력을 편집할 수 있고, 저장할 때에야 409를 받는다. #1250의 서버 잠금은 유지되지만 화면 잠금 표시는 유지되지 않는다.

## ④ OUTBOUND/INBOUND 구분

- 매출 allocation의 실제 `source_slip_id`는 OUTBOUND 1건·4행·1,739,100에만 연결됐다.
- 매입 allocation의 실제 `source_slip_id`는 INBOUND 1건·4행·1,739,100에만 연결됐다.
- OUTBOUND에서 매입전표가 생기거나 INBOUND에서 매출전표가 생기는 역전은 재현되지 않았다.

## ⑤ 공유 DB 무오염 확인

- 검증 전 공유 accounting DB: 매출 12건, 매입 2건.
- 검증 후 공유 accounting DB: 매출 12건, 매입 2건.
- 검증 후 최근 60분 신규 매출·매입 회계전표: 각각 0건.
- 공유 `samhan-*` 컨테이너 24개는 중지·재시작·교체하지 않았다.

공유 DB 오염은 없다.

## ⑥ 마이그레이션 부재 확인

- `origin/main...HEAD` diff 25파일을 확인했다.
- `db/migration`, SQL, Flyway/migration 파일 추가·수정은 0개다.
- `partnerId`, `slipNo`, `productCode`, `sourceLineNo`, `taxType`은 응답 DTO/조회 결합 필드이며 새 저장 컬럼이 아니다.

보고대로 새 저장 필드와 마이그레이션은 없다.

## ⑦ CI 판정

현재 PR은 `mergeable=MERGEABLE`이지만 `mergeStateStatus=UNSTABLE`이며 필수 CI가 실패 중이다.

- accounting 계열 matrix job 5개 실패: 이 브랜치가 `SlipServiceClient` 생성자를 3인자로 바꾸고 `SlipServiceClientTest`의 2인자 생성을 갱신하지 않아 `compileTestJava`에서 컴파일 실패한다.
- 로컬에서 `./gradlew :services:accounting-service:compileTestJava --no-daemon`을 다시 실행해 같은 오류와 종료 코드 1을 재현했다.
- GitGuardian 실패는 안내된 main 기존 시트 식별자이며 별도 PR #1262 범위이므로 #1264 책임에서 제외한다.
- 그 외 프런트엔드, slip, Playwright/Detox 및 guard job은 통과했다.

따라서 GitGuardian을 제외해도 이 브랜치 책임의 red CI가 남아 있다.

## ⑧ 머지 가능/불가 판정 — 도달 결함 2건

**머지 불가.**

- 도달 결함 2건: (1) 새로고침/재진입 후 중복 생성 버튼 재활성화, (2) 새로고침/재진입 후 금액 입력 잠금 표시 해제.
- 별도 merge blocker: 이 브랜치가 만든 accounting 테스트 컴파일 실패로 필수 CI red.
- 회계전표 금액, 4건 allocation, 매출/매입 방향, DB 중복 방지는 정확했다.

## ⑨ 프로세스 회수

- 격리 컨테이너 0개, 격리 volume 0개, 격리 network 0개, 격리 이미지 0개.
- 새 bootJar JAR 0개, 포트 5942 Vite 프로세스 0개.
- `-real-qa` 디렉터리 아래 `_local` 디렉터리·증거 0개.
- 최종 실행 컨테이너는 공유 `samhan-*` 24개뿐이다.

인앱 브라우저 backend가 0개라 이번 라운드의 신규 UI 캡처는 만들지 못했다. 대신 격리 HTTP·DB를 독립 재현하고, 기존 캡처의 표시 행 수와 해시를 직접 대조했다.
