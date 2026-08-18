# 거래처 UUID 통일 + 기초품목 동명 차단 QA 보고서

## ① RED 원문

정찰 보고서 경로 `docs/dev-reports/2026-08-17-partner-importer-recon/report.md`는 이 워크트리에 존재하지 않았고, git 이력에도 없었다. 사용자 브리핑의 정찰 수치를 기준으로 진행했다.

동명 importer 회귀 테스트를 먼저 추가한 뒤 실행한 RED 원문:

```
EcountProductImporterTest > importCsv_활성_동명_기초품목은_CONFLICT로_차단한다() FAILED
    java.lang.AssertionError at EcountProductImporterTest.java:72
...
Expecting actual throwable to be an instance of:
  com.samhanair.logis.common.exception.BusinessException
but was:
  [현재 importer가 동명 품목을 정상 import한 결과]
```

구현 중 최초 격리 migration 실행에서는 다음 원문도 확인했다.

```
ERROR: insert or update on table "dc_configs" violates foreign key constraint
"dc_configs_partner_id_fkey"
DETAIL: Key (partner_id)=(canonical UUID) is not present in table "partners".
```

원인은 child UUID를 부모보다 먼저 갱신할 수 없는 PostgreSQL FK 즉시 검사였다. 이후 트랜잭션 안에서 FK를 임시 해제하고 부모/자식을 함께 치환한 뒤 재생성하도록 수정했다.

## ② 동명 차단 구현

`EcountProductImporter.upsertProduct()`에 활성 기초품목명 검증을 추가했다.

- `name = :name`, `status = 'ACTIVE'`, `is_deleted = FALSE` 조건으로 조회한다.
- 동일 `product_code` 재수입/갱신은 허용한다.
- 다른 활성 기초품목과 이름이 겹치면 `CONFLICT`로 import를 중단한다.
- 견적품목 테이블은 조회하지 않으며, DB 유니크 제약도 추가하지 않았다.
- 관계 export의 대표품목 지정은 기존 `resolveMainCandidate()` 흐름을 그대로 소비한다.

양방향 테스트:

- 활성 동명 기초품목: `CONFLICT` 차단 GREEN
- 동명이 아닌 기초품목: imported=1, aliasImported=1 GREEN
- 기존 `EcountProductImporterTest` 및 `EcountProductImporterSameNameMergeTest`: 전체 GREEN

## ③ UUID 통일 migration

추가 파일:

- `services/dc-config-service/src/main/resources/db/migration/V6__align_partner_uuid_to_partner_service.sql`

매핑은 partner-service canonical DB의 UUID를 코드+사업자번호 2중 키로 추출한 snapshot이며, UUID 값은 사용자 화면/보고서에 노출하지 않는다.

사전 read-only 영향 실측:

| 대상 | 영향 행 |
|---|---:|
| dc-config 활성 partners | 211 |
| dc_configs.partner_id | 211 |
| dc_rules.partner_id | 0 |
| price_calculation_logs.partner_id | 49 |
| FK 참조 합계 | 260 |

migration 불변식:

- 활성 거래처 매핑 누락이면 예외
- 코드+사업자번호 중복 매핑이면 예외
- canonical UUID가 dc-config의 다른 행과 충돌하면 예외
- FK 제약을 트랜잭션 안에서 잠시 해제하고 부모/자식 UUID를 치환
- FK 제약을 동일 형태로 재생성
- 적용 후 dc_configs, dc_rules, price_calculation_logs, partners 고아/키 불일치면 예외
- 예외 시 Flyway transaction 전체 rollback

migration 번호 점검:

- 이 브랜치 / origin/main / 열린 PR 원격 브랜치 전체를 점검했다.
- dc-config-service: 현재 V1~V5, 신규 V6 사용 가능
- partner-service: 현재 V1~V14, 이번 변경에서 partner-service 스키마 변경은 없어 V15를 만들지 않음
- 번호 충돌 없음

## ④ GREEN

일회성 격리 Postgres에서 dc-config V1~V6을 적용하고, 실측 매핑 211행과 FK fixture를 넣어 검증했다.

```
partners             211
valid_dc_configs     211
valid_price_logs      49
orphan_dc_configs      0
orphan_dc_rules       0
```

V6 적용 결과:

```
UPDATE partners              211
UPDATE dc_configs             211
UPDATE dc_rules                 0
UPDATE price_calculation_logs  49
```

검증 완료:

- product-service importer 관련 테스트 GREEN
- dc-config/partner/product bootJar 생성 성공
- desktop typecheck GREEN
- desktop lint: 오류 0, 기존 경고 196
- desktop build GREEN
- design-system typecheck/build GREEN, lint 오류 0(기존 경고 69)

전체 세 서비스 백엔드 통합 테스트는 attestation 값을 주입한 재실행이 120초 제한에 걸려 완료되지 않았다. 첫 실행은 필수 `SAMHAN_GATEWAY_ATTESTATION` 부재로 GatewayAttestationMockMvcConfig에서 연쇄 실패했다. 따라서 전체 백엔드 테스트 GREEN이라고 주장하지 않는다.

## ⑤ DC 계산 무변경 확인

이번 코드 변경에는 dc 계산 서비스 Java 코드 변경이 없다. 변경은 dc-config migration의 partner UUID/FK 치환뿐이다.

공유 DB migration 및 공유 컨테이너 변경은 금지 조건에 따라 수행하지 않았다. 따라서 공유 스택 화면의 DC 계산 실측 캡처는 생성하지 못했다. 격리 DB migration 전후의 FK 유효성은 위 수치로 검증했으나, 실제 화면 행 수·금액 캡처는 미수행이다. 캡처 목적지 `resolveQaShotsDir()`를 우회한 증거는 만들지 않았다.

## ⑥ 이카운트 동일성 확정 2건과의 정합

- 2026-05-19 규칙: 코드와 이름이 다르더라도 품목명이 일치하는 다른 품목이 있으면 같은 품목.
- 2026-07-28 규칙: 코드와 이름이 일치하는 품목이 대표품목.

현재 importer는 `code=name`을 스스로 판정하지 않고 관계 export가 지정한 대표품목을 `resolveMainCandidate()`로 소비한다. 이번 변경은 그 대표품목 결정/alias 병합 로직을 바꾸지 않고, 최종 기초품목 upsert 직전에 활성 동명만 차단한다. 따라서 두 확정과 충돌하지 않으며 견적품목 동명 허용도 유지한다.

## ⑦ 404 제외 사유

라이브 재현은 1/1이었으나 현행 화면 호출 지점은 0곳이었다. 사용자 증상이 아니므로 이번 변경에서 404 경로는 수정하지 않았다.

## ⑧ 프로세스 회수

- 격리 검증용 `codex-partner-uuid-test` 컨테이너: 회수 완료
- 별도 격리 백엔드 컨테이너: 기동하지 않음
- 공유 스택 컨테이너: 변경/중지하지 않음
- 생성 JAR 3개 및 desktop/design-system 빌드 산출물: 삭제 완료
- 남은 `codex-partner-uuid-test` 컨테이너: 0

