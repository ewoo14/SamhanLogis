# LIKE escape 전수(축 A) 구현 보고서

## 범위

승인 기획서 `docs/superpowers/plans/2026-07-24-chore-global-escape-modal.md`의 축 A만 처리했다. 축 B 모달 인쇄 CSS는 변경하지 않았다. 공용 유틸은 만들지 않고 auth/dc-config/slip의 각 서비스 로컬 static helper를 사용했다.

## 전수 표

`git ls-files`로 Java main 소스의 `LIKE`를 훑고, 주석·문서·정규식은 제외했다. 아래는 구현 전 `ESCAPE`가 없던 SQL/Criteria 계열과 처분이다.

| 파일:줄 | 검색 대상 | 서비스 계층 이스케이프 | 사용자 입력 도달 | 처분 |
|---|---|---:|---:|---|
| `auth-service/.../AccountRepository.java:53` | 결재자 표시명 | 없음 | 예, 결재자 picker | 수정: `ApprovalLineApproverService` helper + JPQL `ESCAPE` |
| `dc-config-service/.../DcConfigRepository.java:38-39` | 거래처명/코드 keyword | 없음 | 예, 거래처 DC 설정 화면 | 수정: controller helper + JPQL `ESCAPE` |
| `inventory-service/.../StockTransferRepository.java:23` | transfer_no prefix | 없음 | 아니오, 시스템 prefix | 제외: 사용자 free-text가 아님 |
| `accounting-service/.../AccountingAuditLogRepository.java:54` | 고정 `'mapping.%'` 패턴 | 해당 없음 | 아니오 | 제외: 감사 필드의 고정 패턴 |
| `accounting-service/.../TaxInvoiceBatchRepository.java:58,68` | batch_no prefix | 해당 없음 | 아니오 | 제외: 호출자가 공급하는 시스템 prefix |
| `product-service/.../ProductRepository.java:95-96,109-110` | 상품명/모델명 q | 기존 helper 있음 | 예 | 수정: repository `ESCAPE` 보강 |
| `slip-service/.../SlipAttachmentRepository.java:61,73` | 사진감사 slipNo | 없음 | 예, 관리자 사진감사 검색 | 수정: attachment service helper + JPQL `ESCAPE` |
| `slip-service/.../QuoteSnapshotRepository.java:61` | 견적 거래처명 | 없음 | 예, 견적 이력 검색 | 수정: snapshot service helper + JPQL `ESCAPE` |
| `slip-service/.../ExternalCarrierRepository.java:19-20` | 외부기사명/전화 | 없음 | 예, 외부배송사 관리자 검색 | 수정: external carrier service helper + JPQL `ESCAPE` |
| `slip-service/.../SlipRepository.java:366,380` | 기존 목록 driverPhone | 없음 | 예, 전표 목록 필터 | 수정: SlipService helper + native `ESCAPE` |
| `slip-service/.../SlipRepository.java:418-419` | 결재첨부 slipNo/거래처명 | 없음 | 예, 결재첨부 자동완성 | 수정: SlipService helper + JPQL `ESCAPE` |

기획서의 user 4종(EmployeeRepository)·accounting 참조 4종(Journal/TaxInvoice)은 현행 main에서 이미 서비스 escape와 repository `ESCAPE`가 모두 적용되어 있어 재수정하지 않았다. accounting의 `partnerCode LIKE`는 importer·기간 필터 등 선택된 거래처 코드/내부 값 전달이며 free-text 검색창 경로가 아니고, 현행 repository에는 `ESCAPE`도 이미 있어 제외했다. `partner-order`는 native와 Criteria 양쪽에 이미 helper 및 escape-char overload/`ESCAPE`가 적용되어 있었다.

## 구현

- `%`, `_`, `\`를 순서대로 `\\%`, `\\_`, `\\\\`로 보존한다.
- 바깥쪽 `%...%`는 wildcard로 유지한다.
- native SQL에는 PostgreSQL backslash escape를 명시하고, JPQL에는 `ESCAPE '\\'`를 명시했다.
- Criteria에는 `cb.like(expression, pattern, '\\')` overload를 사용했다.

## RED / GREEN

- RED-A/C: auth service 회귀 테스트를 먼저 추가해 기존 코드에서 `10 tests completed, 1 failed`, 기대 escaped 값과 raw 값 불일치를 확인했다. repository `ESCAPE`만 제거하는 mutation은 PostgreSQL 기본 backslash 동작 때문에 load-bearing 검증이 되지 않으므로 서비스 전달값을 단언했다.
- GREEN: auth 전체 `264 tests, 0 failures, 0 errors, 0 skipped`.
- slip 신규/관련 테스트: attachment 1/1, SlipService 자동완성 1/1, QuoteSnapshot 1/1, ExternalCarrier 1/1 모두 실패 0.
- product `ProductServiceTest`: `74 tests, 0 failures, 0 errors, 0 skipped`.
- slip 전체 테스트는 304초 제한에 도달해 완료 판정을 내리지 않았다. 이후 선택 테스트 재실행 중 build output 디렉터리 lock으로 1회 실패했고, Gradle daemon 정지 후 선택 테스트 2건은 exit 0으로 재실행됐다.
- dc-config 전체/선택 테스트는 기존 test compilation에서 공통 security 클래스(`DynamicPermissionClient`, `PermissionAction` 등) 56건을 찾지 못해 실행되지 않았다. 이 오류는 이번 변경 파일이 아닌 기존 모듈 test classpath 문제다.

실 DB 쓰기와 공유 Docker 재기동은 하지 않았다. 실데이터 건수 대조 및 Testcontainers IT는 환경/시간 제한으로 수행하지 못했으므로 RED-B와 fresh PostgreSQL 실측은 PM 통합 단계의 잔여 검증이다.

## 작업 트리 위생

- 커밋·push: 하지 않음.
- `git diff --stat`: `95 insertions(+), 25 deletions(-)` (삭제 줄 25).
- 신규 파일:
  - `services/dc-config-service/src/test/java/com/samhanair/logis/dcconfig/web/PartnerDcConfigsControllerSearchTest.java`
  - `services/slip-service/src/test/java/com/samhanair/logis/slip/estimate/snapshot/service/QuoteSnapshotServiceSearchTest.java`
  - `services/slip-service/src/test/java/com/samhanair/logis/slip/service/external/ExternalCarrierServiceSearchTest.java`
