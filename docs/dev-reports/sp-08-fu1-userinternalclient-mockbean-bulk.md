# SP-08-FU1 — UserInternalClient @MockBean 일괄 추가 dev-report

## §1 변경 요약

### 배경
SP-08-9 종료 보고서 P2-1 항목: slip-service 의 `UserInternalClient` (user-service 내부 호출, ownerFullName 조회) 가 `SlipService` 에 주입되어 있으나, 다수 IT 에 `@MockBean` 선언이 누락되어 있어 ApplicationContext 로드 실패 또는 Eureka 비활성 환경에서 5xx 유발 가능성이 있었다.

### 적용 대상
- 총 **44개 IT 파일** 수정 (기존 적용 5개 제외 — `SlipSalesDeleteIT`, `SlipSalesUpdateIT`, `SlipFormV20MatchingIT`, `SlipInspectControllerIT`, `SlipQuerySalesIT`)
- 의도적 제외 2건: `AbstractPostgresIT` (추상 부모), `SlipRealtimeBrokerConcurrencyIT` (Spring 컨텍스트 없는 순수 동시성 테스트)

### 적용 패턴 (`SlipQuerySalesIT` 기준 100% 일관)

```java
// @MockBean 선언 (다른 @MockBean 옆)
/** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
@MockBean private UserInternalClient userInternalClient;

// @BeforeEach lenient stub (기존 setUp() 안에 추가 또는 신규 메서드)
Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
        .thenReturn(Optional.of("담당자"));
```

### 평균 변경 라인 수
파일당 평균 약 5줄 (import 1 + @MockBean 주석+선언 2 + lenient stub 2)

### 패키지별 분류

| 패키지 | 파일 수 |
|---|---|
| comment/it | 1 (SlipRealtimeControllerIT) |
| delivery/it | 4 (DeliveryBatch/PublicSignature/PublicSlip/SlipDriverFields) |
| it/dispatch | 6 (Board/EndToEnd/ModCancel/ModE2E/TaskAdmin/TaskInternal) |
| estimate/it | 2 (EstimateController/EstimatePermission) |
| it (root) | 26 (ApplicationContextLoad/SlipCleanup/Controller/Delete/DeliveryTagFilter/Domain/DynamicPermission/EditRequest/Excel/FormV20Persist/InspectionCta/Internal/Lifecycle/Lookup/NumberService/QueryPurchase/QueryRedesign/QueryRedesignSpec/SignatureAdmin/Update/ReceiptOcr) |
| publish | 3 (PublishController/PartnerStrictOn/PartnerStrictOff) |
| repository/dispatch | 1 (DispatchTaskRepository) |
| realtime | 0 (SlipRealtimeBrokerConcurrencyIT — Spring context 없음, 제외) |

## §2 영향 범위

- **FE/Designer 영향**: 없음 (테스트 코드만 변경)
- **API 스펙 변경**: 없음
- **DB 스키마 변경**: 없음
- **프로덕션 코드 변경**: 없음

## §3 검증 결과

```
./gradlew :services:slip-service:compileTestJava
BUILD SUCCESSFUL
```

컴파일 성공 확인. warning 은 기존 `DynamicPermissionClient` deprecation 경고이며 본 변경과 무관.

## §4 후속 follow-up

- **P2-2**: slip-service 기존 단위 테스트 중 `SlipService` 를 직접 인스턴스화 하는 케이스에서 `UserInternalClient` 생성자 주입 누락 여부 점검 필요
- **P2-3**: warehouse name snapshot (SlipLine.warehouseName 등) 추가 시 유사 패턴 client 추가 예정
- `feedback_it_mockbean_external_clients.md` 가드 준수 완료
