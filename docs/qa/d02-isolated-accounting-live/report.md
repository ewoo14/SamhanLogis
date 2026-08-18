# PR #1264 격리 accounting-service 라이브 QA 보고

## ① 격리 스택 구성

- 공유로 사용한 것은 인증뿐이다: 공유 `auth-service` 포트 8080.
- 격리 컨테이너: `d02-live-postgres`, `d02-live-product`, `d02-live-slip`, `d02-live-accounting`.
- 격리 포트: PostgreSQL 15432, product-service 18084, slip-service 18186, accounting-service 18187.
- 서비스 환경변수는 `infrastructure/.env.local`을 compose `--env-file`로 주입했다. 보고서에는 환경변수 이름만 남긴다: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SAMHAN_INTERNAL_TOKEN`, `SAMHAN_GATEWAY_ATTESTATION`, `APP_SERVICES_PRODUCT_SERVICE_BASE_URL`, `APP_SERVICES_SLIP_SERVICE_BASE_URL`, `PRODUCT_SERVICE_BASE_URL`.
- Flyway 확인: product `V45`, slip `V124`, accounting 빈 DB에서 `V104`까지 자체 적용.
- 공유 slip/product DB는 read-only dump로 복제했다. product의 legacy 중복 unique index 때문에 post-data index까지 그대로 복원하지 않고 pre-data/data만 복제했으며, 애플리케이션 Flyway/JPA 기동과 QA 계약은 통과했다.
- 격리 복제본에서 입고 원천 4개 전표의 상태를 `CONFIRMED`로 정합화했다. 변경 대상은 격리 DB뿐이다.

## ② 캡처 ①~④와 행 수

기준일은 `2026-08-03`이다. 모든 캡처는 `resolveQaShotsDir()`에 `QA_SHOTS_DIR`를 지정해 이 디렉터리에 저장했다.

| 캡처 | 파일 | 화면 원본행 | 결과 |
|---|---|---:|---|
| ① 매출 생성 | `01-sales-accounting-slip-created.png` | 4건 | 생성 성공 |
| ② 매입 생성 | `02-purchase-accounting-slip-created.png` | 16건 | 생성 성공 |
| ③ 중복 차단 | `03-duplicate-accounting-slip-blocked.png` | 4건 | 버튼 비활성 확인 |
| ④ 회계반영 뒤 금액 잠김 | `04-accounting-posted-amount-locked.png` | 4건 | 금액 input 비활성 확인 |

캡처 디렉터리: `docs/qa/d02-isolated-accounting-live/`

## ③ 생성된 회계전표 내용 검증

- 매출: 격리 `sales_accounting_slips` 1건, 상태 `DRAFT`, 총액 1,739,100, allocation 4건, allocation 합계 1,739,100.
- 매입: 격리 `purchase_accounting_slips` 1건, 상태 `DRAFT`, 총액 1,739,100, allocation 4건, allocation 합계 1,739,100.
- 두 생성 응답 모두 `taxType=TAXABLE`이며 원천 slip 번호·원천 line 번호 allocation을 포함했다.
- 중복 시나리오는 생성 성공 key를 화면에 기록한 뒤 버튼을 즉시 `이미 생성됨`/disabled로 전환하고, 금액 입력도 disabled로 전환하는 것을 확인했다.
- 격리 daily closing은 `SALES/SALES_SLIP`, `PURCHASE/PURCHASE_SLIP` 각각 생성됐고 모두 잠금 상태였다.

라이브 중 발견해 고친 계약 결함:

- 선발행 탭에서 매출을 생성할 때 탭 이름을 source kind로 사용해 `PURCHASE_SLIP`으로 전송하던 오류를 `closingKind` 기준으로 수정했다.
- accounting의 `SlipServiceClient`가 slip URL을 고정 Eureka 이름으로만 사용하던 문제를 설정 가능한 direct URL로 보완했다. 기본값은 기존 `http://slip-service` 동작을 유지한다.
- 생성 후 원천 slip 조회가 별도 서비스라 즉시 `accountingPostedAt`가 반영되지 않는 상황에서도 UI 중복 차단과 금액 잠금을 유지하도록 로컬 생성 key를 추가했다.

## ④ 공유 DB 무변경 증명

- 공유 PostgreSQL에는 dump 조회와 read-only SQL만 실행했다. 쓰기 명령은 `d02-live-postgres`에만 실행했다.
- 라이브 실행 후 공유 `accounting_db`에서 최근 30분 생성된 매출 회계전표 0건, 매입 회계전표 0건을 확인했다.
- 회계전표·일마감·상태 정합화 write는 모두 격리 PostgreSQL의 `product_db`, `slip_db`, `accounting_db`에만 발생했다.
- 공유 컨테이너는 중지·재시작·교체하지 않았다.

## ⑤ 프로세스·볼륨·이미지 회수 결과

- 최종 라이브 성공 후 Vite 프로세스와 격리 컨테이너 4개를 회수했다.
- 격리 volume 3개, 격리 이미지 3개, JAR 3개, 임시 compose override 1개를 제거했다.
- 최종 잔여 확인: 격리 컨테이너 0, 격리 volume 0, 격리 이미지 0, 포트 5942 프로세스 0, build JAR 0, `_local` 증거 0, `test-results` 0.
- 공유 `samhan-*` 컨테이너와 공유 DB는 유지했다.
