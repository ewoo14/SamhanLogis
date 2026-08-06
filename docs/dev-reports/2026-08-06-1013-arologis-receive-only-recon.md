# #1013 아로로지스 수신 표시 전용 전환 정찰 보고서

- 조사일: 2026-08-06
- 브랜치: `feat/1013-arologis-receive-only`
- 조사 HEAD: `62e4951ec` (`origin/main`과 동일)
- 조사 범위: 코드, 로컬 Docker의 읽기 전용 DB 조회, 최근 컨테이너 로그
- 조사 상태: `DONE_WITH_CONCERNS`
- 변경 범위: 본 보고서 신규 파일 1개만 생성. 코드 삭제·수정, DB 쓰기, migration, 재빌드·재배포, commit·push는 하지 않음.

## 먼저 보고하는 전제 교정

PM이 센 잔재 목록은 대부분 존재하지만, 현재 아로로지스 데스크톱의 `PreClassifyPage.tsx`는 더 이상 8모드 가배차 구현이 아니다. 현재 파일은 `ReceivedGroupsPage`의 별칭이다. 반대로 삼한 퍼블릭의 구형 `clients/desktop` 화면과 `slip-service`의 `PreClassifyService`는 아직 아로로지스 support endpoint를 호출한다.

또한 다음 세 가지는 같은 것으로 세면 안 된다.

1. `ArologisPreClassifySupportClient`: 삼한의 구형/호환 가배차 계산에 필요한 원천을 읽는 서버 간 client.
2. `RegionalService`: `delivery_tag=REGION` 전표를 주소의 17개 시도 prefix로 화면 그룹화하는 구형 지방가배차 service.
3. `RegionClassifier`/`RegionService`/`RegionImportService`: 아로로지스 지역 master를 이용해 주소를 region group으로 보강하고 master를 관리하는 계열.

개발책임자 정정처럼 “지방”과 “야적”의 업무 태그는 `slips.delivery_tag`이다. 다만 현행 `RegionalService`는 이 계약을 선별 단계에서는 이미 사용하고, 주소 문자열은 후속 표시 그룹 키로 사용한다. 따라서 “17개 시도 문자열이 지방 판정 전체를 한다”라고 보고하는 것은 코드와 맞지 않으며, “17개 시도 주소 방식도 그대로 보존해야 한다”라고 보는 것도 지시와 맞지 않는다.

## ① `ArologisPreClassifySupportClient`가 받아 오는 것과 실제 사용량

### client의 실제 endpoint와 데이터

원문 검색:

```text
rg -n "class ArologisPreClassifySupportClient|preclassify-support|regionRules|plannedPartnerCodes|PreClassifySupport" services/slip-service/src/main/java services/arologis-service/src/main/java
```

원문 결과의 핵심:

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:12: /** 아로로지스의 원천 마스터/기존 배차 partnerCode만 읽는다. 분류 계산은 수행하지 않는다. */
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:20:        this.client = builder.baseUrl("http://arologis-service").requestFactory(requestFactory()).build();
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:27: String body = client.get().uri(uri -> uri.path("/internal/arologis/preclassify-support")
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:28:   .queryParam("partnerCodes", String.join(",", partnerCodes)).build())
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:29:   .header("X-Internal-Token", auth.getToken()).retrieve().body(String.class);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:30: JsonNode data = mapper.readTree(body).get("data");
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:31:            var ruleType = mapper.getTypeFactory().constructCollectionType(List.class, RegionRule.class);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:32:            var stringType = mapper.getTypeFactory().constructCollectionType(List.class, String.class);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:33: return new PreClassifySupport(mapper.convertValue(data.get("regionRules"), ruleType),
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/ArologisPreClassifySupportClient.java:34:   mapper.convertValue(data.get("plannedPartnerCodes"), stringType));
```

받는 계약은 다음이다.

```text
GET /internal/arologis/preclassify-support?partnerCodes=<삼한 전표의 partnerCode 목록>
응답 data.regionRules: RegionRule(groupName, keywords, sortOrder) 목록
응답 data.plannedPartnerCodes: 차량 정류/기존 배차에서 확인된 partnerCode 목록
```

아로로지스 쪽 controller 원문:

```text
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:71: /** 삼한 분류 계산에 필요한 원천만 제공한다. 아로로지스는 판정하지 않는다. */
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:72: @GetMapping("/preclassify-support")
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:73: @PreAuthorize("hasRole('MASTER')")
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:74: public ApiResponse<PreClassifySupportResponse> preClassifySupport(
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:75:   @RequestParam(required=false, defaultValue="") String partnerCodes) {
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:76: var rules = regionRepository.findAllByOrderBySortOrderAscGroupNameAsc().stream()
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:79:        var codes = java.util.Arrays.stream(partnerCodes.split(","))
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:80:                .filter(c -> !c.isBlank()).toList();
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:79:        var codes = java.util.Arrays.stream(partnerCodes.split(","))
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:80:                .filter(c -> !c.isBlank()).toList();
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:81: var planned = codes.isEmpty() ? List.<String>of() :
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:82:   vehicleStopRepository.findAllByParsedPartnerCodeIn(codes).stream()
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:83:    .map(VehicleStop::getParsedPartnerCode)
services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java:84:                .filter(c -> c != null && !c.isBlank()).distinct().toList();
```

### 삼한이 그것으로 잃는 것

삼한의 구형 분류 service가 실제로 의존한다.

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:29:        List<PreClassifySlip> slips = slipQuery.find(from, to);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:30:        List<String> partnerCodes = slips.stream().map(PreClassifySlip::partnerCode).filter(c -> c != null && !c.isBlank()).distinct().toList();
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:31:        PreClassifySupport support = supportClient.getSupport(partnerCodes);
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:45:        Set<String> planned = support.plannedPartnerCodes().stream().collect(Collectors.toSet());
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:49:            String region = classifyRegion(slip.address(), support.regionRules());
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:50:            var entry = new PreClassifyResponse.Entry(slip.slipNo(), slip.partnerCode(), slip.partnerName(),
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:51:                    slip.address(), region, slip.partnerCode() != null && planned.contains(slip.partnerCode()));
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:62: boolean stack = "STACK".equals(slip.deliveryTag());
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:63: boolean region = "REGION".equals(slip.deliveryTag());
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:64: if (mode == STACK_ONLY) return stack;
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:65: if (mode == REGION_ONLY) return region;
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:66: if (stack) return true;
services/slip-service/src/main/java/com/samhanair/logis/slip/service/preclassify/PreClassifyService.java:67: if (mode.number() <=3 && region) return false;
```

따라서 support client/endpoint를 먼저 없애면 삼한의 `/admin/dispatches/pre-classify` 구형 API가 다음 두 입력을 잃는다.

- 아로로지스 region master의 `regionRules`를 이용한 주소 그룹 분류.
- 아로로지스 차량 정류의 `parsed_partner_code`를 이용한 `plannedPartnerCodes` 판정.

하지만 “코드상 호출한다”와 “현재 값이 실제로 온다”는 분리해야 한다.

### 로컬 실 데이터 측정

아로로지스 차량 정류의 support 원천:

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE is_deleted = false AND parsed_partner_code IS NOT NULL) AS active_with_partner_code, COUNT(DISTINCT parsed_partner_code) FILTER (WHERE is_deleted = false AND parsed_partner_code IS NOT NULL) AS active_distinct_partner_codes FROM vehicle_stops;"
 total_rows | active_rows | active_with_partner_code | active_distinct_partner_codes
------------+-------------+--------------------------+-------------------------------
159         | 159         | 2                        | 2
(1 row)
```

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT parsed_partner_code, COUNT(*) AS active_stop_rows FROM vehicle_stops WHERE is_deleted = false AND parsed_partner_code IS NOT NULL GROUP BY parsed_partner_code ORDER BY parsed_partner_code;"
 parsed_partner_code | active_stop_rows
--------------------+------------------
 202608034           | 1
 P0-6-C001           | 1
(2 rows)
```

아로로지스 region master:

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE is_deleted = true) AS soft_deleted_rows FROM region_dispatch_classifications;"
 total_rows | active_rows | soft_deleted_rows
------------+-------------+-------------------
 0          | 0           | 0
(1 row)
```

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT group_name, sort_order, keywords FROM region_dispatch_classifications WHERE is_deleted = false ORDER BY sort_order, group_name;"
 group_name | sort_order | keywords
------------+------------+----------
(0 rows)
```

삼한 활성 출고전표와 위 두 partnerCode의 현재 교집합:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COUNT(*) AS active_outbound_with_partner_code, COUNT(DISTINCT partner_code) AS distinct_partner_codes FROM slips WHERE is_deleted = false AND slip_type = 'OUTBOUND' AND partner_code IS NOT NULL AND partner_code <> '';"
 active_outbound_with_partner_code | distinct_partner_codes
-----------------------------------+------------------------
 122                               | 9
(1 row)
```

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COUNT(*) AS active_slips_matching_arologis_planned_codes, COUNT(DISTINCT partner_code) AS matching_partner_codes FROM slips WHERE is_deleted = false AND partner_code IN ('202608034', 'P0-6-C001');"
 active_slips_matching_arologis_planned_codes | matching_partner_codes
----------------------------------------------+------------------------
 0                                            | 0
(1 row)
```

결론은 다음이다.

- 현재 local active DB 기준으로 `regionRules`는 0건이다.
- 아로로지스에 `parsed_partner_code` 원천은 2건/2개 코드가 있으나 현재 삼한 활성 전표와 일치하는 `plannedPartnerCodes` 사용 대상은 0건/0개 코드다.
- 따라서 현재 실 데이터에서 support 결과가 실제 분류값으로 쓰이는 건수는 `regionRules` 0건, `plannedPartnerCodes`와 일치하는 활성 전표 0건이다.
- 이것은 호출 횟수 0이라는 뜻은 아니다. 코드상 삼한 `PreClassifyService` 요청마다 client를 호출한다. 이 구조에는 호출 이력 테이블/카운터가 없고, 최근 24시간 컨테이너 로그에서 관련 문자열 매칭은 0건이었다. 로그 매칭 0건은 과거 호출 0건의 증거가 아니다.

## ② `RegionalService`·`RegionClassifier`·`RegionService`·`RegionImportService` 계열의 성격

### `RegionalService` 원문

```text
rg -n "deliveryTag|SIDO_PREFIXES|extractSido|지방|주소" services/arologis-service/src/main/java -g 'RegionalService.java'
```

```text
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:21: * 지방 가배차 서비스 — Phase 10 PR-E1 BE-A4 (legacy GAS 15번 이식).
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:23: * <p>출고전표의 {@code deliveryTag=REGION} 선별 → 거래처 주소의 광역 prefix 추출 → 시도별 그룹핑.
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:29: *   <li>BE-A4 (본 서비스) — REGION 태그로 지방 전표를 선별한 뒤 시도별로 묶는다. 주소는
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:35: *   <li>주소 정규화 (공백 제거)</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:36: *   <li>{@link #SIDO_PREFIXES} 17 개 prefix 순서대로 substring 매칭</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:57:    static final List<String> SIDO_PREFIXES = Arrays.asList(
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:62:     * 지방 가배차 시도별 분류 조회.
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:80:            // 지방은 주소 표식이 아니라 판매전표 배송 태그 계약으로 판정한다.
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:81:            if (!"REGION".equals(slip.deliveryTag())) {
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:84:            String sido = extractSido(slip.address());
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:101:     * 주소 → 광역 prefix 추출.
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:103:     * @param address 주소 문자열 (null/blank 가능)
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:106:    String extractSido(String address) {
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionalService.java:111:        for (String prefix : SIDO_PREFIXES) {
```

이 service는 “지방 여부”를 주소 17개 문자열로 판단하는 코드가 아니다. 먼저 `delivery_tag = REGION`으로 전표를 선별하고, 그 다음 주소에서 시도 이름을 뽑아 표시용 그룹을 만든다. 다만 개발책임자가 17개 시도 문자열 방식을 정정했으므로, 현재 표시 그룹 규칙을 새 계약으로 인정할 근거는 없다.

### `RegionClassifier` 원문과 소비자

```text
rg -n "class RegionClassifier|findAllByIsDeletedFalse|classified_region_group|safeClassify|RegionClassifier" services/arologis-service/src/main/java
```

```text
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionClassifier.java:15: * 결정. 매칭 안 됨 시 null 반환 (저장은 진행, classified_region_group 만 NULL).
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionClassifier.java:38:public class RegionClassifier {
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionClassifier.java:102:        log.debug("RegionClassifier 매칭 실패 — address={}", address);
services/arologis-service/src/main/java\com\samhanair\logis\arologis\parser\KakaoDispatchParser.java:5:import com.samhanair.logis.arologis.service.RegionClassifier;
services/arologis-service/src/main/java\com\samhanair\logis\arologis\parser\KakaoDispatchParser.java:37:     * PR-D 2-1 — RegionClassifier 통합 (옵션). 미주입 환경 (단위 테스트) regionGroup=null.
services/arologis-service/src/main/java\com\samhanair\logis\arologis\parser\KakaoDispatchParser.java:226:        // PR-D 2-1 — RegionClassifier 통합 (주입 시) parsedAddress → regionGroup 매칭
services/arologis-service/src/main/java\com\samhanair\logis\arologis\parser\KakaoDispatchParser.java:232:    /** RegionClassifier 호출 wrapper — null-safe. 단위 테스트 (classifier=null) 환경 fail-safe. */
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:44: *   <li>GET /admin/arologis/regions — 전체 조회</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:45: *   <li>POST /admin/arologis/regions — 단건 추가</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:46: *   <li>POST /admin/arologis/regions/import — CSV 일괄 import (multipart)</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:47: *   <li>PUT /admin/arologis/regions/{id} — 단건 수정 (keywords/sortOrder)</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:48: *   <li>DELETE /admin/arologis/regions/{id} — Soft Delete</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\DispatchManualService.java:50:    /** PR-D 2-1 — 수동 입력 정차도 RegionClassifier 매칭하여 classified_region_group 채움. */
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\DispatchManualService.java:84:                String regionGroup = safeClassify(ms.address());
```

`RegionClassifier`는 `slips.delivery_tag`를 읽는 지방 선별기가 아니다. 주소를 아로로지스의 region master 그룹으로 보강하는 parser/manual/가배차 공통 부품이다. master가 비어 있는 현재 DB에서는 신규 계산 결과가 사실상 null이 된다. 그러나 과거에 저장된 `vehicle_stops.classified_region_group`는 별도 잔재로 남을 수 있다. 이 차이는 삭제 전에 보존 정책을 결정해야 하는 이유다.

### `RegionService`·`RegionImportService`·admin API 원문

```text
rg -n "class RegionService|class RegionImportService|/admin/arologis/regions|@PostMapping|@PutMapping|@DeleteMapping|multipart|분류 그룹|검색어" services/arologis-service/src/main/java
```

```text
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionService.java:24:public class RegionService {
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionService.java:46:     * @param keywords 시군구 콤마 구분 검색어
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionImportService.java:25: * <p>입력 컬럼 (BOM prefix 제거 후): {@code 분류 그룹}, {@code 검색어}.
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionImportService.java:39:public class RegionImportService {
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionImportService.java:67:                throw new IllegalArgumentException("CSV 헤더 누락 — 최소 2개 컬럼 필요 (분류 그룹, 검색어)");
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionImportService.java:73:                throw new IllegalArgumentException("CSV 헤더 오류 — 첫 컬럼 '분류 그룹' 필요, 실제: " + col1);
services/arologis-service/src/main/java\com\samhanair\logis\arologis\service\RegionImportService.java:76:                throw new IllegalArgumentException("CSV 헤더 오류 — 둘째 컬럼 '검색어' 필요, 실제: " + col2);
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:44: *   <li>GET /admin/arologis/regions — 전체 조회</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:46: *   <li>POST /admin/arologis/regions/import — CSV 일괄 import (multipart)</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:47: *   <li>PUT /admin/arologis/regions/{id} — 단건 수정 (keywords/sortOrder)</li>
services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\RegionAdminController.java:48: *   <li>DELETE /admin/arologis/regions/{id} — Soft Delete</li>
```

성격별 판단 근거:

- `RegionalService`는 Arologis-owned 구형 표시/분류 surface에 가깝다. `REGION` tag 선별은 새 계약과 맞지만, 17개 주소 prefix 표시 규칙은 개발책임자 지시와 충돌한다. 삼한의 `delivery_tag` 기반 새 표시 계약으로 대체할 후보이지, 현재 코드 그대로 이관할 대상은 아니다.
- `RegionClassifier`는 단순 지방/야적 태그 분류가 아니다. parser와 수동 배차가 주소 보강 결과를 `vehicle_stops`에 저장하므로, `delivery_tag` 기반으로 기계적으로 치환하면 업무 규칙을 바꾼다.
- `RegionService`와 `RegionImportService`는 region master의 CRUD/import writer다. 현재 active master 0건이어도 기존 컬럼 값과 호출자가 있으므로 즉시 삭제 근거는 부족하다.
- 셋째 가능성은 “삭제”와 “delivery_tag로 삼한 이관”의 중간인 **호환/보존 경계**다. Arologis에서 신규 authoring과 신규 classifier 실행은 중단하되, 기존 저장 결과와 읽기 호환을 유지하고, 삼한의 새 표시 계약과 parser 보존 정책이 확정된 뒤 master/table/column을 정리하는 방식이다.

따라서 이 계열의 현재 답은 (c) 셋째다. `RegionalService`와 region master 계열을 한 번에 삭제하거나 모두 `delivery_tag`로 바꾸라는 결론은 코드와 데이터만으로는 지지되지 않는다. `RegionalService`의 지방 표시 surface와 `RegionClassifier`의 주소 보강 surface를 분리해 후속 결정해야 한다.

## ③ V3 테이블과 연관 컬럼의 실 행 수

V3 migration 원문:

```text
rg -n "CREATE TABLE region_dispatch_classifications|classified_region_group|CREATE UNIQUE INDEX|CREATE INDEX" services/arologis-service/src/main/resources/db/migration/V3__add_region_dispatch_classification.sql
```

```text
1:-- V3__add_region_dispatch_classification.sql
6:-- 1) region_dispatch_classifications — 지역 분류 마스터 (19+ 그룹)
12:-- 2) vehicle_stops 보강 — classified_region_group 컬럼 추가
21:-- 1) region_dispatch_classifications — 가배차 지역 분류 마스터
23:CREATE TABLE region_dispatch_classifications (
24:    id              UUID            PRIMARY KEY,
25:    group_name      VARCHAR(50)     NOT NULL,
26:    keywords        TEXT            NOT NULL,
27:    sort_order      INT             NOT NULL DEFAULT 0,
35:    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
39:CREATE UNIQUE INDEX ux_region_classifications_group_active
40:    ON region_dispatch_classifications (group_name)
44:CREATE INDEX ix_region_classifications_sort_active
45:    ON region_dispatch_classifications (sort_order ASC, group_name ASC)
49:-- 2) vehicle_stops 보강 — classified_region_group
54:ALTER TABLE vehicle_stops
55:    ADD COLUMN classified_region_group VARCHAR(50);
58:CREATE INDEX ix_vehicle_stops_region_group_active
59:    ON vehicle_stops (classified_region_group)
60:    WHERE is_deleted = FALSE AND classified_region_group IS NOT NULL;
```

테이블 자체:

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE is_deleted = true) AS soft_deleted_rows FROM region_dispatch_classifications;"
 total_rows | active_rows | soft_deleted_rows
------------+-------------+-------------------
 0          | 0           | 0
(1 row)
```

V3 적용 여부:

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT version, description, success FROM flyway_schema_history WHERE version = '3' OR description ILIKE '%region%';"
 version | description                         | success
---------+-------------------------------------+---------
 3       | add region dispatch classification | t
(1 row)
```

그러나 V3가 만든 연관 컬럼의 기존 값은 별도로 측정했다.

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT classified_region_group, COUNT(*) FROM vehicle_stops WHERE is_deleted = false GROUP BY classified_region_group ORDER BY classified_region_group NULLS FIRST;"
 classified_region_group | count
-------------------------+-------
                         | 154
 경기동부                    | 1
 경기서북부                  | 1
 서울특별시                  | 2
 인천광역시                  | 1
(5 rows)
```

NULL/blank 출력에 의존하지 않는 재확인:

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS active_vehicle_stops, COUNT(*) FILTER (WHERE classified_region_group IS NOT NULL AND BTRIM(classified_region_group) <> '') AS active_with_classified_region_group FROM vehicle_stops WHERE is_deleted = false;"
 active_vehicle_stops | active_with_classified_region_group
----------------------+-------------------------------------
                  159 |                                   5
(1 row)
```

결론: `region_dispatch_classifications` 테이블은 실 행 0건이다. 하지만 V3 연관 `vehicle_stops.classified_region_group`에는 활성 행 중 비어 있지 않은 과거 분류 값이 5건 있다. 이 저장소에서 “테이블이 비었으니 관련 데이터가 없다”라고 보고하면 안 되며, 다른 트랙의 QA 표본/기존 operational snapshot을 잃을 수 있다. 이 정찰에서는 해당 행을 식별하거나 삭제하지 않았다.

## ④ 아로로지스가 표시할 배차내역의 삼한 계약

현재 확인된 계약은 하나의 단일 계약이 아니라 두 갈래다.

### A. 수신 표시 전용에 가장 가까운 dispatch-group snapshot

삼한 송신 DTO 원문:

```text
services/slip-service/src/main/java\com\samhanair\logis\slip\dto\dispatchgroup\DispatchGroupTransferRequest.java

public record DispatchGroupTransferRequest(String groupNo, LocalDate dispatchDate, String vehicleLabel, String carrierCode, String carrierName, List<Slip> slips) {
    public record Slip(String slipNo, String inclusionType, int sequence, String partnerCode, String partnerName, String deliveryAddress) {}
}
```

송수신 endpoint 원문:

```text
services/slip-service/src/main/java\com\samhanair\logis\slip\client\ArologisDispatchGroupClient.java:
POST /internal/arologis/dispatch-groups

services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:21:    @PostMapping("/internal/arologis/dispatch-groups")
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:27:    @GetMapping("/admin/arologis/dispatch-groups")
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:29:    public ApiResponse<?> list(@RequestParam LocalDate dispatchDate) {
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:32:                        "groupNo", g.getGroupNo(),
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:33:                        "dispatchDate", g.getDispatchDate(),
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:34:                        "vehicleLabel", g.getVehicleLabel(),
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:35:                        "carrierCode", g.getCarrierCode(),
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:36:                        "carrierName", g.getCarrierName(),
services/arologis-service/src/main/java\com\samhanair\logis\arologis\web\ReceivedDispatchGroupController.java:37:                        "slips", g.getSlipSnapshot()))
```

아로로지스 화면 API 원문:

```text
clients/arologis-desktop/src/renderer/api/receivedDispatchGroups.ts:

interface ReceivedDispatchGroup {
  groupNo: string;
  dispatchDate: string;
  vehicleLabel: string;
  carrierCode: string;
  carrierName: string;
  slips: string;
}

list(dispatchDate) {
  return GET '/admin/arologis/dispatch-groups' params { dispatchDate };
}
```

화면 원문:

```text
clients/arologis-desktop/src/renderer/routes/dispatches/ReceivedGroupsPage.tsx:15:    { key: 'mode', header: '운영', render: () => '수신 전용' },
clients/arologis-desktop/src/renderer/routes/dispatches/ReceivedGroupsPage.tsx:17:  return <main data-testid="arologis-received-groups-page" style={{ padding: 24, display: 'grid', gap: 16 }}><header><h1>수신 배차 그룹</h1><p>삼한 퍼블릭에서 전송받은 배차 그룹을 표시합니다. 아로로지스에서는 그룹을 수정하거나 재분류할 수 없습니다.</p></header><Card><label>배차 지정일 <Input aria-label="배차 지정일" type="date" value={date} onChange={e => setDate(e.target.value)} /></label></Card><Card>{groups.isError ? <p role="alert">수신 그룹을 불러오지 못했습니다.</p> : <DataTable columns={columns} rows={groups.data ?? []} rowKey={row => row.groupNo} emptyMessage="수신된 배차 그룹이 없습니다." />}</Card></main>
```

현재 로컬 DB에서도 이 계약은 실제 데이터가 있다.

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows FROM received_dispatch_groups;"
 total_rows | active_rows
------------+-------------
 1          | 1
(1 row)
```

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT group_no, dispatch_date, vehicle_label, carrier_code, carrier_name, slip_snapshot, is_deleted FROM received_dispatch_groups WHERE is_deleted = false ORDER BY dispatch_date, group_no;"
 group_no         | dispatch_date | vehicle_label | carrier_code | carrier_name | slip_snapshot                                                                                                      | is_deleted
------------------+---------------+---------------+--------------+--------------+--------------------------------------------------------------------------------------------------------------------+-----------
 S11-20260805-01  | 2026-08-05    | S11 QA 1톤    | AROLOGIS     | 아로로지스    | [{"slipNo":"2026/08/04-1","inclusionType":"INBOUND","sequence":1,"partnerCode":"P-2026-0018","partnerName":"강릉HVAC솔루션","deliveryAddress":null}] | f
(1 row)
```

삼한 원본 dispatch group의 상태도 확인했다.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT transfer_status, COUNT(*) FROM dispatch_groups WHERE is_deleted = false GROUP BY transfer_status ORDER BY transfer_status;"
 transfer_status | count
-----------------+-------
 NOT_SENT        | 1
 SENT            | 1
(2 rows)
```

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT group_no, dispatch_date, vehicle_label, transfer_status FROM dispatch_groups WHERE is_deleted = false ORDER BY dispatch_date, group_no;"
 group_no          | dispatch_date | vehicle_label | transfer_status
-------------------+---------------+---------------+-----------------
 S11-20260805-01   | 2026-08-05    | S11 QA 1톤    | SENT
 S11-20260805-EXT-01 | 2026-08-05  | S11 QA 외부 1톤 | NOT_SENT
(2 rows)
```

따라서 수신 표시 그룹 계약은 **이미 존재하고 실제 1건이 수신되어 있다**. 새 endpoint를 발명하기보다 이 계약을 canonical read/display surface로 정리하는 것이 현재 근거에 맞다.

### B. 별도로 존재하는 operational dispatch receive 계약

```text
services/slip-service/src/main/java\com\samhanair\logis\slip\dto\dispatch\ArologisDispatchRequest.java:
  samhanDispatchTaskId, taskCode, dispatchDate, vehicles
  VehicleGroup: sequence, vehicleType, slips
  SlipRef: sequence, slipId, slipNumber, partnerCode, partnerName, address,
           recipientPhoneNumber, notes

services/slip-service/src/main/java\com\samhanair\logis\slip\client\ArologisDispatchClient.java:
  POST /internal/arologis/dispatches

services/arologis-service/src/main/java\com\samhanair\logis\arologis\controller\ArologisInternalController.java:
  receiveDispatch -> Dispatch/Vehicle/VehicleStop 저장
```

> 🚨 **정정 (2026-08-07 · SOL 1차 적대검증)** — 아래 단락의 `27건` 은 **폐기된 측정값이며 현재 근거로 사용 금지**다.
> 현재값은 **26건 / 활성 26건** 이다. 재실행 원문은 이 절 끝에 있다.
> 이 오류는 PM 이 PR 본문 서술을 실측 없이 옮긴 데서 나왔고, S2 라운드에서 구현자가 잡았다.

~~현재 활성 DB에는 직접 operational dispatch가 27건이나, 현재 active row 중 `samhan_dispatch_task_id`가 채워진 것은 0건이다.~~ (폐기)

```text
[폐기된 측정값 — 현재 근거로 사용 금지]
 total_dispatches | active_dispatches | active_received_from_samhan
------------------+-------------------+-----------------------------
 27               | 27                | 0
```

**현재값 (2026-08-07 재실행)**

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_deleted = false) AS active FROM dispatches;"
 total | active
-------+--------
    26 |     26
(1 row)

대표 행  6fca3392-f1c3-42ad-9d52-6597e6b87e01 | 2026-04-01 | DAY | samhan_dispatch_task_id = NULL
```

⚠️ 이 절의 근거 SQL 중 `vehicle_label` · `status` 는 현재 `dispatches` 스키마에 **없는 컬럼**이다.
실제 컬럼은 `dispatch_type` · `samhan_dispatch_task_id` 다.

이 **26건**은 기존 operational/direct receive 경로와 관련될 수 있으므로, group snapshot이 있으니 `/internal/arologis/dispatches`도 지워도 된다는 근거가 아니다. 현재 확인된 계약만으로는 “그룹 표시 전용 계약”과 “운영 dispatch/GPS/reply에 쓰일 수 있는 계약”의 canonicalization 결정이 먼저 필요하다.

## ⑤ 세 화면에서 지금 사용자가 실제로 쓰는 것

### `PreClassifyPage`

현재 파일 원문:

```text
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:
/** 아로로지스 수신 전용 배차 그룹 화면 — 가배차 8모드의 권위는 삼한으로 이전되었다. */
export { ReceivedGroupsPage as ArologisPreClassifyPage } from './ReceivedGroupsPage'
```

계약 테스트 원문:

```text
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.contract.test.ts:
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.contract.test.ts:9:    expect(source).not.toMatch(/EXECUTION_MODES|DispatchExecutionMode|setExecutionMode|saveDispatchHistory/)
clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.contract.test.ts:13:    expect(source).toContain('ReceivedGroupsPage')
```

판정: 이 파일을 제거하면 아로로지스의 현재 `/dispatches/pre-classify` 수신 표시 화면이 사라진다. 현재 파일 안에 가배차 계산/저장 규칙은 없다. 대체 기능은 이미 `ReceivedGroupsPage`에 있고, route `/dispatches/received-groups`도 존재한다. 다만 `DispatchesLayout`에는 `/dispatches/received-groups`가 링크되지 않고, `/dispatches/pre-classify`의 메뉴 라벨은 아직 “가배차 분류”라서 화면 명칭/내비게이션은 미완이다.

구형 잔재인 `clients/arologis-desktop/src/renderer/api/arologisDispatch.ts`에는 8모드 endpoint 선언이 남아 있지만, 현재 `PreClassifyPage`에서 import되는 증거는 찾지 못했다. 이 파일이 orphan인지 최종 확인하려면 전체 bundle/build 또는 import graph 검증이 필요하며 이번 정찰에서는 실행하지 않았다.

### `ManualDispatchPage`

화면이 실제로 제공하는 규칙:

```text
clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:
clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:11: *  │ │ - textarea (카톡 형식)    │ │ - 도착일 / 유형 / driverCode    │ │
clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:24: * - driverCode 비워두면 BE 가 기사 자동 매칭을 수행
clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:196:  const [kakaoText, setKakaoText] = useState('')
clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:203:  const [driverCode, setDriverCode] = useState('')
clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:233:        toRequest(dispatchDate, dispatchType, driverCode, vehicles),
clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:266:        toRequest(dispatchDate, dispatchType, driverCode, vehicles),

clients/arologis-desktop/src/renderer/api/arologisManual.ts:
clients/arologis-desktop/src/renderer/api/arologisManual.ts:7: * - `POST /admin/arologis/dispatches/manual/preview` — 입력 검증 + echo (저장 X)
clients/arologis-desktop/src/renderer/api/arologisManual.ts:8: * - `POST /admin/arologis/dispatches/manual`         — Dispatch + Vehicle + VehicleStop 일괄 저장
```

backend의 두 번째 endpoint는 Arologis `Dispatch`, `Vehicle`, `VehicleStop`을 저장한다. 즉 수신 표시 전용이 아니라 Arologis-owned operational/manual write surface다. `DispatchManualService`는 새 stop을 저장할 때 `RegionClassifier`로 주소를 보강한다.

현재 화면의 `기사 조회` 버튼은 `/dispatches/pre-classify`로 이동한다. 현재 그 route는 수신 그룹 표시 별칭이므로, 기존 버튼 의미와 현재 목적지가 이미 어긋난다. 이는 삭제 승인 근거가 아니라 실제 UI 계약 결함의 증거다.

삼한에는 대체로 다음의 새 forward dispatch/group 흐름이 있다.

```text
clients/desktop/src/renderer/api/dispatchTask.ts:
POST /admin/dispatch-tasks
POST /admin/dispatch-tasks/{taskId}/vehicle-groups
POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips
PUT /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/order
POST /admin/dispatch-tasks/{taskId}/dispatch  -> Arologis 전송
clients/desktop/src/renderer/api/dispatchTask.ts:7: *   <li>{@code POST /admin/dispatch-tasks}                                            — 신규 DispatchTask (DRAFT)</li>
clients/desktop/src/renderer/api/dispatchTask.ts:12: *   <li>{@code POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips}    — slip 그룹 할당</li>
clients/desktop/src/renderer/api/dispatchTask.ts:16: *   <li>{@code POST /admin/dispatch-tasks/{taskId}/dispatch}                          — 배차 완료 → arologis 발송</li>
```

그러나 이것은 자유 형식 Kakao parser 기반의 Arologis manual create와 1:1로 같다는 근거가 없다. 따라서 `ManualDispatchPage`는 receive-only 목표와 충돌하지만, 바로 삭제하기 전에 manual 업무를 삼한 group flow로 완전히 커버하는지 별도 결정해야 한다.

### `DispatchesLayout`

현재 visible menu 원문:

```text
clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx:
{ to:'/dispatches/manual', label:'수동 배차' },
{ to:'/dispatches/pre-classify', label:'가배차 분류' },
{ to:'/dispatches/unassigned', label:'미배차' },
{ to:'/dispatches/reconcile', label:'실배차 비교' }
```

route 원문:

```text
clients/arologis-desktop/src/renderer/routes/index.tsx:
/dispatches/manual       -> ManualDispatchPage
/dispatches/pre-classify -> ArologisPreClassifyPage(= ReceivedGroupsPage)
/dispatches/unassigned
/dispatches/reconcile
/dispatches/received-groups -> ReceivedGroupsPage
/dispatches              -> /dispatches/manual
```

판정: `DispatchesLayout`는 receive-only 화면 자체가 아니라, 쓰기 가능한 수동 배차를 root로 열고 구형 라벨을 노출하는 navigation surface다. 삼한에 대체가 있는 것은 forward dispatch/group 기능이지, 현재 Arologis의 모든 manual/unassigned/reconcile 운영 기능을 대체한다는 증거는 없다. 따라서 이 layout은 “삭제 대상”이라기보다 receive-only 계약을 기준으로 메뉴·root·route ownership을 재설계해야 하는 대상이다.

참고로 `ArologisRealtimeClient.ts`는 다음 endpoint를 정의하지만 현재 Arologis desktop에서 import/호출하는 곳은 `rg`로 찾지 못했다.

```text
clients/arologis-desktop/src/renderer/realtime/ArologisRealtimeClient.ts:21: export const ArologisDispatchRealtimeClient = createRealtimeClient({
clients/arologis-desktop/src/renderer/realtime/ArologisRealtimeClient.ts:23: endpointPath: id => `/admin/arologis/dispatches/${encodeURIComponent(id)}/realtime`
```

orphan처럼 보이지만 직접 dispatch 상세/GPS 화면의 동적 import까지 이번 정찰에서 증명한 것은 아니므로 마지막 삭제 후보로 둔다.

## ⑥ 23 지방가배차 계승 범위와 ②의 표면 동일성

삼한 퍼블릭의 구형 화면은 실제로 두 탭을 한 화면에 담고 있다.

```text
rg -n "getPreClassify|getRegional|/admin/dispatches/pre-classify|/admin/arologis/dispatches/regional|REGION|시도" clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx clients/desktop/src/renderer/api/arologisDispatchApi.ts
```

```text
clients/desktop/src/renderer/api/arologisDispatchApi.ts:14: *   <li>GET /admin/dispatches/pre-classify?from&to — 삼한 권역 분류 (REGION 마스터)
clients/desktop/src/renderer/api/arologisDispatchApi.ts:16: *   <li>GET /admin/arologis/dispatches/regional?date        — 시도 분류 (광역 prefix)
clients/desktop/src/renderer/api/arologisDispatchApi.ts:109:export async function getPreClassify(
clients/desktop/src/renderer/api/arologisDispatchApi.ts:115:    '/admin/dispatches/pre-classify',
clients/desktop/src/renderer/api/arologisDispatchApi.ts:125:export async function getRegional(date: string): Promise<RegionalResponse> {
clients/desktop/src/renderer/api/arologisDispatchApi.ts:127:    '/admin/arologis/dispatches/regional',
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:8: * - GET /admin/dispatches/pre-classify?from&to → PreClassifyResponse (slip-service S2)
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:9: * - GET /admin/arologis/dispatches/regional?date       → RegionalDispatchResponse (BE-A4)
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:43:  getPreClassify,
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:44:  getRegional,
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:116:    queryFn: () => getPreClassify(from, to, executionMode),
clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:125:    queryFn: () => getRegional(date),
```

두 탭은 **같은 legacy UI 표면**에는 있다. 그러나 업무 규칙은 다르다.

- 첫 탭: 삼한 `PreClassifyService`가 8모드, `delivery_tag`(`REGION`, `STACK`, `DAY`, `RETURN_RENTAL`)와 support 원천을 이용하는 가배차 계산 surface다.
- 둘째 탭: Arologis `RegionalService`가 `delivery_tag=REGION`을 먼저 고른 뒤 주소 17개 시도 prefix로 표시 그룹을 만드는 지방가배차 surface다.
- `RegionClassifier` 계열: 위 두 탭과 별개로 Arologis region master를 parser/manual/stop enrichment에 쓰는 주소 보강 surface다.

로컬 활성 전표의 tag 분포도 확인했다.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT delivery_tag, COUNT(*) FROM slips WHERE is_deleted = false GROUP BY delivery_tag ORDER BY delivery_tag NULLS FIRST;"
 delivery_tag | count
--------------+-------
              | 117
 DAY          | 6
 STACK        | 2
(3 rows)
```

NULL/blank을 명시값으로 바꾼 재확인:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COALESCE(NULLIF(BTRIM(delivery_tag), ''), '(NULL/blank)') AS delivery_tag, COUNT(*) FROM slips WHERE is_deleted = false GROUP BY COALESCE(NULLIF(BTRIM(delivery_tag), ''), '(NULL/blank)') ORDER BY delivery_tag;"
 delivery_tag | count
--------------+-------
 (NULL/blank) |   117
 DAY          |     6
 STACK        |     2
(3 rows)
```

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COUNT(*) AS active_outbound, COUNT(*) FILTER (WHERE delivery_tag = 'REGION') AS active_region, COUNT(*) FILTER (WHERE delivery_tag = 'STACK') AS active_stack, COUNT(*) FILTER (WHERE delivery_tag = 'DAY') AS active_day, COUNT(*) FILTER (WHERE delivery_tag = 'RETURN_RENTAL') AS active_return_rental FROM slips WHERE is_deleted = false AND slip_type = 'OUTBOUND';"
 active_outbound | active_region | active_stack | active_day | active_return_rental
-----------------+---------------+--------------+------------+---------------------
 123             | 0             | 2            | 6          | 0
(1 row)
```

현재 local DB에는 활성 `REGION` 출고전표가 0건이어서 23 지방가배차의 현재 실 샘플은 없다. 이 결과를 운영/production의 23건 또는 실제 지방 물량 0건으로 일반화할 수 없다.

최종 판단:

- “삼한에서 받은 배차내역만 표시”라는 제품 표면으로는 두 legacy 탭 모두 제거/대체 검토 범위에 들어간다.
- 그러나 #23 지방가배차와 ②의 region family는 하나의 이관 트랙이 아니다. `RegionalService`의 표시 그룹 규칙은 `delivery_tag` 기반 새 삼한 계약으로 재정의할 수 있지만, `RegionClassifier`/master/import는 주소 보강과 historical persistence가 얽혀 있다.
- 따라서 23 지방가배차는 **삼한의 delivery_tag 기반 표시/계산 트랙**으로 묶을 수 있고, region master/classifier는 **보존·분리·소비자 정리 트랙**으로 나누는 것이 근거에 맞다. 같은 화면에 있었다는 이유만으로 같은 migration을 하면 안 된다.

## ⑦ 제거 순서 제안

아래 순서는 구현하지 않은 제안이다.

1. **canonical 표시 계약을 먼저 확정한다.** 우선 `GET /admin/arologis/dispatch-groups`와 `ReceivedGroupsPage`를 아로로지스의 수신 표시 전용 배차내역으로 명시한다. 그룹 snapshot으로 충분한지, operational `/internal/arologis/dispatches`의 상세/GPS/reply 읽기 계약을 별도로 유지할지 결정한다.
2. **삼한 sender와 수신 read path를 먼저 관찰 가능하게 한다.** `SENT`/`PENDING` 재시도, `groupNo` upsert, 화면 빈 상태를 확인할 수 있어야 한다. 현재 DB에는 수신 1건과 삼한 `SENT` 1건이 있으므로 이 계약을 기준 표본으로 보존한다.
3. **삼한의 구형 분류 소비자를 먼저 교체하거나 명시적으로 보류한다.** `PreClassifyService`가 `ArologisPreClassifySupportClient`를 호출하는 동안 support endpoint를 제거하지 않는다. `delivery_tag` 기반 삼한 계약이 확정되고, regionRules/plannedPartnerCodes의 대체가 검증된 뒤 client와 endpoint의 유지 여부를 결정한다.
4. **아로로지스 UI의 root/menu/label을 수신 계약에 맞춘다.** `/dispatches/received-groups`를 canonical route로 만들고, 현재 `/dispatches/pre-classify` alias와 “가배차 분류” 라벨의 호환 여부를 정한다. root가 `/dispatches/manual`로 가는 문제와 manual 화면의 `기사 조회` 링크를 함께 처리한다.
5. **소비자 없는 Arologis write/admin surface를 차단한다.** `RegionalService` endpoint, `RegionAdminController` CRUD/import, `ManualDispatchPage`와 manual save/preview는 각각 실제 소비자와 대체 flow를 확인한 뒤 중단한다. `RegionalService`와 region master/classifier를 한 commit/한 삭제로 묶지 않는다.
6. **region 저장 구조는 마지막에 보존 정책 후 정리한다.** 테이블 0건만 보고 V3 table/column을 지우지 않는다. 활성 `vehicle_stops`의 비어 있지 않은 `classified_region_group` 5건을 포함한 보존/재계산/아카이브 결정을 먼저 남긴다. hard delete는 하지 않는다.
7. **orphan 후보는 import graph와 상세 기능을 확인한 뒤 제거한다.** `arologisDispatch.ts`, `ArologisRealtimeClient.ts`, mock/test 잔재는 현재 `rg`상 사용되지 않아 보이지만, dynamic import와 direct dispatch detail/GPS route를 확인하기 전에는 마지막 단계로 둔다.

## ⑧ 되돌리는 것이 안 되돌리는 것보다 위험한 경우

있다. 특히 API/DB ownership을 되돌리는 것은 단순 UI rollback보다 위험하다.

- 수신 controller/DB를 먼저 제거하고 삼한 sender를 남기면 dispatch-group 전송이 실패한다. 삼한의 transfer 상태가 `PENDING`으로 남거나 재시도가 발생하고, 아로로지스 표시 화면은 빈다.
- `ArologisPreClassifySupportClient` 또는 `/internal/arologis/preclassify-support`를 먼저 제거하면 현재 삼한 `PreClassifyService`의 요청 경로가 깨진다. 현재 값이 0건이어도 dependency 호출 자체는 존재한다.
- V3 table/column을 hard delete하면 table 행은 현재 0건이어도 `vehicle_stops.classified_region_group`의 기존 5건이 사라진다. 코드 rollback만으로 저장된 분류 결과는 복구되지 않는다.
- group snapshot과 direct operational dispatch를 조정하지 않고 양쪽을 번갈아 켜면 같은 업무가 서로 다른 key/shape로 이중 표시될 수 있다. group 전송은 `groupNo` 기준 upsert지만 direct dispatch는 다른 task/dispatch 구조다.
- 새 receive-only route를 먼저 지우고 구 route로 되돌리는 경우, 이미 새 계약으로 쌓인 snapshot은 구 8모드 화면이 이해하지 못한다. 반대로 UI label/redirect만 되돌리는 것은 상대적으로 위험이 낮다.

따라서 안전한 rollback은 우선 navigation/label 수준이며, sender/receiver endpoint, schema, 데이터 보존을 되돌리는 것은 release 전 smoke/재시도/중복/QA 표본 확인 없이는 더 위험하다.

## ⑨ 이번 라운드가 보지 않은 것

- Electron 실제 기동, preload 인증, 브라우저 화면 QA, 사용자 권한별 UI 동작. 개발책임자 지시에 따라 억지로 띄우지 않았다.
- AWS/production DB와 production traffic. 이번 SQL은 local `samhan-postgres` 컨테이너의 `arologis_db`와 `slip_db`에 한정된다.
- DB 쓰기, migration 실행, Docker rebuild/redeploy, 전체 테스트 suite/build.
- 과거 전체 호출량과 support endpoint의 durable request telemetry. 최근 24시간 로그 문자열 매칭 0건만 읽었으며, 호출 횟수의 증거로 사용하지 않았다.
- manual dispatch를 삼한 dispatch-group flow가 완전히 대체할 수 있는지에 대한 업무 승인.
- direct `/internal/arologis/dispatches` receive 계약을 group snapshot으로 통합할지에 대한 최종 결정.
- region master/classifier의 historical retention, parser/manual의 모든 dynamic import 및 production consumer.
- 23 지방가배차의 production 표본과 전체 QA 데이터. local 활성 `REGION` 출고전표가 0건이라는 사실만 확인했다.

## 신규 파일 목록

- [docs/dev-reports/2026-08-06-1013-arologis-receive-only-recon.md](docs/dev-reports/2026-08-06-1013-arologis-receive-only-recon.md)

이 보고서 외에는 파일을 만들거나 수정하지 않았다. 이 라운드에서는 어떤 코드·DB 데이터도 삭제하지 않았다.

## 2026-08-06 Codex S1 후속 — 1~2단계 관찰 가능성 표식

개발책임자 결정에 따라 표시 정본은 `GET /admin/arologis/dispatch-groups` + `ReceivedGroupsPage`로 확정했다. operational `/internal/arologis/dispatches` 관련 기존 상세/GPS/회신 표면은 삭제·이동·개명하지 않았다.

### RED-first 원문

추가한 `ReceiveOnlyContractTest`를 구현 전 실행한 Gradle 원문은 다음과 같다.

```text
ReceiveOnlyContractTest > receiver_observes_group_no_upsert() FAILED
    java.lang.AssertionError at ReceiveOnlyContractTest.java:32

ReceiveOnlyContractTest > sender_observes_sent_and_pending_retry_states() FAILED
    java.lang.AssertionError at ReceiveOnlyContractTest.java:46

ReceiveOnlyContractTest > received_group_endpoint_is_explicit_canonical_display_contract() FAILED
    java.lang.AssertionError at ReceiveOnlyContractTest.java:24

ReceiveOnlyContractTest > empty_received_read_is_explicitly_observable() FAILED
    java.lang.AssertionError at ReceiveOnlyContractTest.java:39

4 tests completed, 4 failed
```

각 실패의 AssertJ 기대/실제 원문은 첫 실행의 Gradle 콘솔에는 line number만 출력되어 JUnit XML에 남지 않았다. 같은 assertion을 단일 RED로 재실행해 확보한 원문은 다음과 같다.

```text
Expecting actual:
  "... ReceivedDispatchGroupService ..."
to contain:
  "__RED_EXPECTED_UPSERT__"

at ReceiveOnlyContractTest.receiver_observes_group_no_upsert(ReceiveOnlyContractTest.java:32)
```

A~D의 의미는 각각 다음과 같다.

```text
A expected: "수신 표시 정본" in controller/page; actual: 기존 소스에 해당 명시 문구 없음
B expected: "groupNo={} upsert=UPDATED/CREATED"; actual: 기존 수신 service에 upsert 관찰 로그 없음
C expected: "수신 그룹 0건"; actual: 기존 controller에 빈 목록 관찰 로그 없음
D expected: "groupNo={} status=SENT/PENDING"; actual: 기존 sender에 상태 전환 관찰 로그 없음
```

### 구현 및 GREEN 원문

수신 controller/service, `ReceivedGroupsPage`, 삼한 `DispatchGroupService`에 문서·로그 표식만 추가했다. `groupNo` upsert 로직, 빈 목록 반환, operational dispatch 로직은 변경하지 않았다.

```text
BUILD SUCCESSFUL
> Task :services:arologis-service:test
4 tests completed
```

추가로 실행한 기존 참조 테스트:

```text
BUILD SUCCESSFUL
> Task :services:arologis-service:test
```

```text
✓ src/renderer/routes/dispatches/PreClassifyPage.contract.test.ts (2 tests)
Test Files  1 passed (1)
Tests       2 passed (2)
```

slip-service의 변경 파일 참조 테스트는 Testcontainers가 기존 DB를 변경할 수 있고 컨테이너 lifecycle을 시작할 수 있어 실행하지 않았다. 대신 testClasses 컴파일은 실행했다.

```text
BUILD SUCCESSFUL
> Task :services:slip-service:testClasses
```

### I7 전/후 대조 — 정정된 기준 26건

이번 라운드 전후 SELECT 원문은 동일했다. 두 조회 모두 DB 쓰기 없이 실행했다.

전:

```text
 total | active
-------+--------
    26 |     26
(1 row)

                  id                  | dispatch_date | dispatch_type | samhan_dispatch_task_id
--------------------------------------+---------------+---------------+-------------------------
 6fca3392-f1c3-42ad-9d52-6597e6b87e01 | 2026-04-01    | DAY           |
(1 row)
```

후:

```text
 total | active
-------+--------
    26 |     26
(1 row)

                  id                  | dispatch_date | dispatch_type | samhan_dispatch_task_id
--------------------------------------+---------------+---------------+-------------------------
 6fca3392-f1c3-42ad-9d52-6597e6b87e01 | 2026-04-01    | DAY           |
(1 row)
```

### 보고서 ⑦ 근거 SQL 중 재현 불가 항목

기존 보고서의 다음 SQL은 현재 `arologis_db.dispatches` 스키마에서 재현되지 않는다.

```text
ERROR:  column "vehicle_label" does not exist
ERROR:  column "status" does not exist
```

현재 실제 스키마 원문:

```text
column_name              | data_type
-------------------------+-----------------------------
id                       | uuid
dispatch_date            | date
dispatch_type            | character varying
raw_kakao_text           | text
created_at               | timestamp without time zone
created_by               | character varying
modified_at              | timestamp without time zone
modified_by              | character varying
deleted_at               | timestamp without time zone
deleted_by               | character varying
is_deleted               | boolean
samhan_dispatch_task_id  | uuid
```

따라서 기존 보고서의 `vehicle_label`·`status` 기반 대표 행 인용은 증거로 사용할 수 없으며, 이번 라운드의 대표 행은 실제 컬럼인 `dispatch_type`과 `samhan_dispatch_task_id`로 정정했다.

### 자기표면 닫기

① 새로 가능해진 상태·화면 조합과 확인 결과

```text
- 수신 그룹 존재 + ReceivedGroupsPage: 표시 정본 문구와 groupNo row key 확인
- 동일 groupNo 재수신: 기존 service의 find → replaceSnapshot 경로와 UPDATED 로그 확인
- 수신 그룹 0건: controller가 200 빈 배열을 유지하고 0건 로그를 남기는 경로 확인
- sender 전송 성공: SENT 로그 표식 확인
- sender 응답 유실/재시도: PENDING 로그 표식과 기존 retryPendingTransfers 경로 확인
- operational dispatch 26건: DB active count 및 대표 행 전/후 동일 확인
```

② 제거·이동·개명 식별자 grep 전수

이번 라운드에는 제거·이동·개명한 식별자가 없다. 금지된 3~7단계 식별자는 grep으로 존재를 재확인했으며, `ArologisPreClassifySupportClient`, `RegionalService`, `RegionAdminController`, `ManualDispatchPage`, `classified_region_group`, `arologisDispatch.ts`, `ArologisRealtimeClient`가 여전히 검색된다. 즉 해당 표면을 건드리지 않았다.

③ 바꾼 파일 참조 테스트

```text
- ReceiveOnlyContractTest: 4/4 PASS
- ArologisPageCodesTest: PASS
- PreClassifyPage.contract.test.ts: 2/2 PASS
- slip-service testClasses: PASS
- slip-service Testcontainers IT: DB 변경·컨테이너 lifecycle 금지로 미실행
```

### 신규 파일 목록

- `services/arologis-service/src/test/java/com/samhanair/logis/arologis/dispatch/ReceiveOnlyContractTest.java`

이번 후속 라운드에서도 DB 데이터, operational dispatch 코드, 3~7단계 표면은 삭제·수정하지 않았다. 커밋·푸시는 PM이 수행한다.

## 2026-08-06 Codex S2 — 제거 순서 3단계: 구형 분류 소비자 보류 고정

### ① 호출 경로 전수 추적과 결정 지점

현재 호출 경로는 다음과 같다.

```text
slip-service /admin/dispatches/pre-classify
  -> PreClassifyAdminController
  -> PreClassifyService.classify(from, to, mode)
  -> PreClassifySlipQuery.find(from, to)
  -> ArologisPreClassifySupportClient.getSupport(partnerCodes)
  -> GET http://arologis-service/internal/arologis/preclassify-support?partnerCodes=...
  -> ArologisInternalController.preClassifySupport()
  -> regionRules + plannedPartnerCodes
  -> PreClassifyService.classifyRegion(address, regionRules)
  -> PreClassifyResponse.Entry.dispatchPlanned = plannedPartnerCodes.contains(partnerCode)
```

코드상 결정은 둘로 나뉜다.

- `delivery_tag`는 `matchesMode`에서 `REGION_ONLY`/`STACK_ONLY` 및 일반 8모드의 포함·제외만 결정한다.
- `regionRules`는 주소를 지역 그룹명으로 매핑한다. 시도 prefix, keyword fallback, sort order가 모두 이 응답을 사용한다.
- `plannedPartnerCodes`는 아로로지스 `vehicle_stops.parsed_partner_code`와 삼한 전표 `partnerCode`의 일치로 `dispatchPlanned` 플래그를 결정한다.

그러므로 support endpoint를 제거하면 호출 오류뿐 아니라 기존 API의 `regionGroups`와 `dispatchPlanned` 결과가 사라진다.

### ② 판정: 이번 라운드는 교체가 아니라 명시적 보류

`delivery_tag`만으로는 현재 두 결과를 동치로 만들 수 없다. 현재 태그는 업무 분류(`REGION`, `STACK`, `DAY`, `RETURN_RENTAL`)를 나타내지만 지역 그룹명·주소 keyword 규칙과 차량 정류의 배차예정 partner code를 제공하지 않는다.

따라서 다음 조건이 모두 충족될 때까지 `ArologisPreClassifySupportClient`와 `/internal/arologis/preclassify-support`를 유지한다.

1. 삼한 delivery-tag 계약에 지역 그룹 결정값(또는 그 값을 제공하는 검증된 대체 API)이 포함된다.
2. `plannedPartnerCodes`에 대응하는 배차예정 판정 필드/계약이 삼한에서 정의된다.
3. 동일한 입력 표본에 대해 8모드 결과, `regionGroups`, `unclassified`, `dispatchPlanned`가 기존 support 경로와 일치한다.
4. support 호출자 전수 grep 및 실제 호출 telemetry에서 더 이상 소비자가 없음을 확인한다.

이 조건 전에는 endpoint/client 삭제가 I3·RED-A·RED-B 위반이다. 이번 코드 변경은 이 보류 조건을 검사하는 `ReceiveOnlyContractTest` 가드 추가뿐이며, 운영 구현·endpoint·데이터는 제거하지 않았다.

### ③ 현재 로컬 실측 — 표본 변경으로 판정 불가 유지

이번 세션의 읽기 전용 SELECT 원문은 다음과 같다.

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS active_region_rules FROM region_dispatch_classifications WHERE is_deleted = false;"
 active_region_rules
---------------------
                  20
(1 row)
```

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE is_deleted = false AND parsed_partner_code IS NOT NULL) AS active_with_partner_code, COUNT(DISTINCT parsed_partner_code) FILTER (WHERE is_deleted = false AND parsed_partner_code IS NOT NULL) AS active_distinct_partner_codes FROM vehicle_stops;"
 total_rows | active_rows | active_with_partner_code | active_distinct_partner_codes
------------+-------------+---------------------------+-------------------------------
        157 |         157 |                         0 |                             0
(1 row)
```

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COUNT(*) AS active_outbound, COUNT(*) FILTER (WHERE delivery_tag = 'REGION') AS active_region, COUNT(*) FILTER (WHERE delivery_tag = 'STACK') AS active_stack, COUNT(*) FILTER (WHERE delivery_tag = 'DAY') AS active_day, COUNT(*) FILTER (WHERE delivery_tag = 'RETURN_RENTAL') AS active_return_rental FROM slips WHERE is_deleted = false AND slip_type = 'OUTBOUND';"
 active_outbound | active_region | active_stack | active_day | active_return_rental
----------------+---------------+--------------+------------+----------------------
            2346 |            14 |           12 |         55 |                   14
(1 row)
```

현재 표본에서 `plannedPartnerCodes`는 active partner code 원천이 0건이므로 실제 `dispatchPlanned=true`를 만드는 건수는 0건이다. 그러나 `regionRules`는 20건이고 REGION 전표 후보는 14건이므로 region 분류 효과를 0건으로 결론 낼 수 없다. 착수 보고서의 이전 표본(아로로지스 region master 0건 등)과 현재 DB가 다르므로, 이 결과는 결함 0이 아니라 **판정 불가**다. 실 경로 표본은 REGION 전표 14건을 같은 날짜 범위로 `PreClassifyService`에 통과시켜 기존 support 결과와 대체 결과를 나란히 비교해야 하며, 이번 라운드에는 service 호출/DB 쓰기/컨테이너 재기동을 하지 않았다.

operational dispatch 보존 재확인:

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_deleted = false) AS active FROM dispatches;"
 total | active
-------+--------
    26 |     26
(1 row)
```

```text
docker exec samhan-postgres psql -U samhan -d arologis_db -c "SELECT id, dispatch_date, dispatch_type, samhan_dispatch_task_id FROM dispatches WHERE is_deleted = false ORDER BY dispatch_date, id LIMIT 1;"
                  id                  | dispatch_date | dispatch_type | samhan_dispatch_task_id
--------------------------------------+---------------+---------------+-------------------------
 6fca3392-f1c3-42ad-9d52-6597e6b87e01 | 2026-04-01    | DAY           |
(1 row)
```

착수 전 보고서의 26건/활성 26건 및 동일 대표 행과 현재 결과가 일치한다.

### RED-first 및 자기표면 닫기

```text
& '.\\gradlew.bat' :services:slip-service:test --tests "com.samhanair.logis.slip.service.preclassify.PreClassifyServiceTest" --tests "com.samhanair.logis.slip.service.preclassify.PreClassifyAdminControllerTest"
BUILD SUCCESSFUL in 9s
18 actionable tasks: 1 executed, 17 up-to-date
```

```text
& '.\\gradlew.bat' :services:arologis-service:test --tests "com.samhanair.logis.arologis.dispatch.ReceiveOnlyContractTest"
BUILD SUCCESSFUL in 6s
15 actionable tasks: 2 executed, 13 up-to-date
```

- RED-A: 삼한 `PreClassifyServiceTest` 8모드·제외·STACK·region·planned 결과 테스트가 GREEN이다.
- RED-B: 새 `ReceiveOnlyContractTest.legacy_preclassify_support_contract_is_retained_until_delivery_tag_replacement_is_proven`가 client URI, 두 support 필드 소비, endpoint mapping을 동시에 고정한다.
- RED-C: 이번 라운드에는 delivery_tag 대체 구현을 하지 않았으므로 해당 GREEN 주장은 해당 없음이다. 대체 결과 비교 표본이 아직 없어 교체하지 않았다.
- RED-D: 기존 `ReceiveOnlyContractTest` 4개와 operational dispatch SELECT가 유지된다.

① 새로 가능해진 조합: support endpoint/client가 존재하는 상태에서 기존 8모드 분류를 실행하는 조합만 유지했다. delivery_tag만으로 지역명·planned를 대체하는 조합은 열지 않았다.

② 제거·이동·개명 식별자 grep: `ArologisPreClassifySupportClient`, `/internal/arologis/preclassify-support`, `RegionalService`, `RegionAdminController`, `ManualDispatchPage`, `classified_region_group`, `arologisDispatch.ts`, `ArologisRealtimeClient`가 모두 여전히 검색된다. 제거·이동·개명은 없다.

③ 바꾼 파일 참조 테스트: 변경된 테스트 파일을 포함한 `ReceiveOnlyContractTest`와 삼한 pre-classify 관련 두 테스트 클래스만 실행했으며 모두 GREEN이다. Testcontainers IT, 브라우저 QA, 전체 suite는 실행하지 않았다.

### 마이그레이션·변경 파일

- 서비스 브랜치 파일 최고: `arologis-service V25`, `slip-service V112`.
- DB 적용 최고: `arologis_db V25`, `slip_db V115`.
- 열린 PR #1088 예약 migration: 없음.
- 신규 migration: 없음. DB 데이터 변경·hard delete·컨테이너 재빌드/재시작 없음.
- 수정 파일: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/dispatch/ReceiveOnlyContractTest.java`.
- 신규 파일: 없음.
