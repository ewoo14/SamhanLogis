# 2026-07-05 — #28 단톡방 매핑 데이터 갭 fix (PR #743)

> #26 (ChatRoomMappingClient URL fix) 라이브 QA 가 적발한 후속 데이터 갭 — partner_chat_room_mappings
> 112건 전량 NOTION_IMPORT LEGACY placeholder·실 partner 0 매칭. 본 PR 이 1차 fix, Opus 5-agent
> 라운드1 이 지적한 비차단 LOW 2건을 Opus 가 직접 fix (개발책임자 디스패치).

## 근본원인

1. **이중인코딩** — `RestClientPartnerLookupClient.findPartnerCodeByName` 이
   `uriBuilder.queryParam("name", UriUtils.encode(businessName.trim(), UTF_8))` 로 사업자명을
   수동 percent-encode 한 뒤 `UriComponentsBuilder` 기반 `queryParam` 에 전달 — `queryParam` 자체가
   최종 URI 조립 시 값을 다시 encode 하므로 한글 사업자명이 **두 번 encode** 되어 partner-service 가
   받는 `name` 쿼리 파라미터가 원문과 전혀 다른 문자열(mojibake)이 됨. 결과: 모든 사업자명이 상시
   404 → `findPartnerCodeByNameWithVariants` 전량 실패 → 모든 row 가 `legacyAliasCode(businessName)`
   경유 LEGACY-NAME-xxxxxx alias 로만 적재 (partner_chat_room_mappings 전량 LEGACY placeholder,
   #26 라이브 QA 가 재확인).
2. **리터럴 lookup (본 라운드 LOW)** — 이중인코딩 제거 + 정규화 후보 순차조회로 향후 import 는 실
   partnerCode 해소가 가능해졌지만, 기존에 이미 생성된 LEGACY row 를 재해소(backfill)하는
   `backfillLegacyAliasIfResolved` 는 **CSV 원본 businessName 리터럴 단건**으로만
   `repository.findAllByPartnerBusinessNameSnapshot(businessName)` 조회 — 과거 다른 표기(회사표기
   `주식회사`/담당자 괄호/공백 차이 등)로 이미 생성된 LEGACY row 는 리터럴이 일치하지 않아 영영
   회수되지 않는 완전성 갭이 있었다. 정규화 방향이 "현재 row 원문 → 후보 축소"이므로, 과거 LEGACY
   snapshot 이 그 축소 후보 중 하나와 일치하는 경우(예: 과거엔 짧게 "에어디자이너" 로만 저장,
   이번 CSV 는 "에어디자이너 주식회사 (김미선)")에도 리터럴 단건 조회로는 못 찾는다.

## fix

- `RestClientPartnerLookupClient.findPartnerCodeByName` — 수동 `UriUtils.encode()` 제거,
  `queryParam` 에 원문 그대로 전달 (1회 encode 만 발생). (라운드1, 이미 반영됨)
- `ChatRoomImportService` — `findPartnerCodeByNameWithVariants` 로 회사표기/담당자 괄호/공백 제거
  정규화 후보를 `LinkedHashSet` 순서로 순차 조회 (원문 우선, 실패 시에만 완화). (라운드1, 이미 반영됨)
- **`backfillLegacyAliasIfResolved` (본 라운드 LOW fix)** — 리터럴 단건 조회 대신
  `businessNameCandidates(businessName)` 정규화 후보 전체를 순차 조회하도록 확장. soft-delete
  대상 자체는 기존과 동일하게 `LEGACY_ALIAS_PREFIX` prefix + 동일 `chatRoomName` 필터로 정밀하게
  유지 — 다른 단톡방에 걸린 legacy row 오삭제 위험은 없다. 여러 정규화 후보가 우연히 같은 row 를
  중복 반환할 수 있어 `mapping.getId()` 기준 `Set` dedupe 후 1회만 soft-delete 하도록 방어.
  (`services/notification-service/src/main/java/com/samhanair/logis/notification/service/ChatRoomImportService.java`)

## 검증

- 신규 회귀 테스트 `ChatRoomImportServiceTest#importCsv_resolvedPartnerCode_backfillsLegacyRowMatchedOnlyByNormalizedCandidate`
  — CSV 원본 "에어디자이너 주식회사 (김미선)" 이 정규화 후보 "에어디자이너" 로 실 partnerCode 해소되고,
  LEGACY row 의 snapshot 이 정확히 그 정규화 후보("에어디자이너")로만 조회되는 (리터럴 조회로는
  0건) 상황을 재현 — soft-delete 성공을 검증.
- **RED→GREEN 직접 검증**: fix 적용 전 (리터럴 단건 조회로 임시 되돌림) 신규 테스트 단독 실행 →
  `1 test completed, 1 failed` (AssertionFailedError, `legacy.getIsDeleted()` 기대 실패) 확인 후,
  fix 재적용 → 통과. 회귀 테스트가 실제로 이번 버그를 잡아낸다는 것을 실증.
- `./gradlew :services:notification-service:test --tests "*ChatRoomImport*" --rerun-tasks --no-build-cache`
  → **BUILD SUCCESSFUL**, `ChatRoomImportServiceTest` 15 tests / 0 failures / 0 errors / 0 skipped
  (기존 14 + 신규 1).
- `./gradlew :services:notification-service:compileJava :services:notification-service:compileTestJava :services:notification-service:test`
  (모듈 전체) → **BUILD SUCCESSFUL** — 다른 회귀 없음 확인.

## 데이터 갭 정직 보고

- 본 fix 는 **알고리즘 recall 개선**이며, 이미 운영 DB 에 적재된 112건 LEGACY row 를 자동으로
  소급 정정하지 않는다. 실제 반영을 위해서는 Notion CSV 를 partner-service 실 데이터 대비 **재import**
  해야 하며, 그때 비로소 `backfillLegacyAliasIfResolved` 가 (정규화 후보 포함) 동작해 매칭되는
  LEGACY row 를 soft-delete 한다.
- 정규화는 "현재 re-import row 원문 → 후보 축소(회사표기/괄호/공백 제거)" 방향으로만 동작한다.
  만약 과거 LEGACY row 의 snapshot 이 현재 re-import 원문보다 **더 구체적/장황한 표기**였다면
  (즉, 현재 원문을 아무리 축소해도 과거 snapshot 과 같아질 수 없는 경우) 이번 fix 로도 회수되지
  않는다 — 이는 "정보를 되살릴 수 없다"는 정규화의 본질적 한계이며, 완전 해소를 위해서는 별도
  수기 매핑(admin UI) 또는 거래처코드 컬럼 명시가 필요하다 (이미 `거래처코드` 컬럼 우선 매핑 경로가
  존재 — 재import 시 거래처코드를 채워주면 이 한계를 완전히 우회한다).
- 위 잔여 갭은 별도 백로그가 아니라 본 PR 의 알려진 한계로 기록한다 ([[feedback_fix_in_current_pr_no_split]]
  — 별도 이슈 분리 없이 본 dev-report 에 정직하게 남김).

## 교훈

- 정규화 후보 리스트(`businessNameCandidates`)를 만들어 두고도 **조회 지점(lookup) 과 회수 지점
  (backfill)** 양쪽에 일관되게 적용하지 않으면 절반짜리 fix 가 된다 — 같은 정규화 로직을 사용하는
  모든 소비 지점을 전수 점검해야 한다 ([[feedback_defect_family_sweep_fix]]).
- `RestClient`/`UriComponentsBuilder` 조합에서 쿼리 파라미터를 수동으로 pre-encode 하면 거의 항상
  이중인코딩이다 — Spring 의 URI 빌더 계열에 원문을 그대로 넘기고 인코딩은 프레임워크에 위임할 것.

## 2026-07-06 Codex config 재수렴 후속

- in-scope: notification-service 한정 env template 재수렴. `services/notification-service/src/main/resources/application.yml`
  의 `${SAMHAN_*}` 소비 변수와 `infrastructure/docker-compose.local-all.yml` / `infrastructure/docker-compose.prod.yml`
  notification-service 주입값을 대조했고, `infrastructure/env-templates/notification-service.env` 에 누락된
  `SAMHAN_AUTH_SERVICE_URL`, `SAMHAN_NOTIFICATION_PARTNER_LOOKUP_ENABLED`,
  `SAMHAN_NOTIFICATION_SEED_TEST_DATA` 를 추가했다.
- out-of-scope 후속 config-audit 슬라이스: `infrastructure/env-templates/arologis-service.env` 의
  `SAMHAN_SLIP_SERVICE_URL` 이 compose 기준 `http://slip-service:8086` 이 아닌 `8084` 로 남아 있는 건은
  arologis-service 범위라 본 fix 에서 수정하지 않았다.
- out-of-scope 후속 config-audit 슬라이스: prod `SAMHAN_USER_CLIENT_FAIL_MODE=STRICT` 미배선은
  notification-service config-code mismatch concern 으로 남기고, 본 fix 에서는 문서화만 수행했다.
