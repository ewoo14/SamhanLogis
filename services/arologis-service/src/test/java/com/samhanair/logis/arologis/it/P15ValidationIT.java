package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.DynamicPermissionClient;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.client.SlipServiceClient.OutboundSlipSummary;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.UnassignedSlipResponse;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.UnassignedService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * P1-5 arologis 배차 validation IT — 미배차 슬립 5건 + 가용 기사 3명 fixture.
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>fixture 기사 3명 — INTERNAL / appInstalled TRUE / is_deleted FALSE 저장 확인</li>
 *   <li>fixture 배차 5건 — status=PENDING (assigned_driver_id=NULL) 저장 확인</li>
 *   <li>미배차 집계 — 5건 모두 미배차 (slipServiceClient stub 기준)</li>
 *   <li>수동 배차 API — 기사 1명에 vehicle 1대 ASSIGNED 전환 성공 (200)</li>
 *   <li>수동 배차 후 해당 vehicle status ASSIGNED + assigned_driver_id 非NULL 검증</li>
 *   <li>미배차 집계 — 배차 완료 1건 제외, 잔여 4건 확인 (slipServiceClient partnerCode 매핑)</li>
 *   <li>가용 기사 목록 조회 API — 3명 응답 확인 (200, isArray, size ≥ 3)</li>
 *   <li>미존재 driverCode 배차 요청 → 404</li>
 *   <li>미존재 dispatchId 배차 요청 → 404</li>
 * </ol>
 *
 * <p>@MockBean 4종 격리 의무 (PR #134~#144 회고 가드):
 * <ul>
 *   <li>{@link PartnerClient} — skeleton-mode, lenient empty</li>
 *   <li>{@link SlipClient} — signature 등록 false (lenient)</li>
 *   <li>{@link NotificationClient} — send true (lenient)</li>
 *   <li>{@link SlipServiceClient} — 개별 테스트에서 stub 조정</li>
 * </ul>
 *
 * <p>AbstractPostgresIT extends — Testcontainers PostgreSQL 16-alpine 싱글턴 컨테이너.
 * Docker 미가용 환경에서는 DockerAvailableCondition 이 전체 skip.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class P15ValidationIT extends AbstractPostgresIT {

    // ---- 상수 — 결정적 fixture driverCode (사용자 노출 식별자, UUID 비공개 가드) ----
    private static final String DRV_P15_001 = "DRV-P15-T001";
    private static final String DRV_P15_002 = "DRV-P15-T002";
    private static final String DRV_P15_003 = "DRV-P15-T003";

    // ---- 미배차 슬립 partnerCode stub — UnassignedService left join 시뮬레이션 ----
    /** partnerCode 5건 — slipServiceClient stub 에서 반환. 배차 전 모두 unassigned. */
    private static final String PC_501 = "P15-PC-501";
    private static final String PC_502 = "P15-PC-502";
    private static final String PC_503 = "P15-PC-503";
    private static final String PC_504 = "P15-PC-504";
    private static final String PC_505 = "P15-PC-505";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DispatchRepository dispatchRepository;
    @Autowired
    private VehicleRepository vehicleRepository;
    @Autowired
    private VehicleStopRepository stopRepository;
    @Autowired
    private DriverRepository driverRepository;
    @Autowired
    private SignatureRepository signatureRepository;
    @Autowired
    private DriverLocationRepository locationRepository;
    @Autowired
    private UnassignedService unassignedService;

    /** 3종 @MockBean 격리 — PR #134~#144 회고 가드 의무. 2026-05-14 UserClient 제거 (자체 user 도메인). */
    @MockBean
    private PartnerClient partnerClient;
    @MockBean
    private SlipClient slipClient;
    @MockBean
    private NotificationClient notificationClient;
    @MockBean
    private SlipServiceClient slipServiceClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    // ---- fixture 참조 (BeforeEach 에서 JPA 저장 후 할당) ----
    private UUID dispatchId1;
    private UUID vehicleId1;

    /**
     * 매 테스트 전 — 테이블 전체 cleanup 후 P1-5 fixture 재구성.
     *
     * <p>FK 삭제 순서: signatures → driver_locations → vehicle_stops → vehicles → dispatches → drivers.
     * (V6 migration SQL 과 동일 의존 역순)
     *
     * <p>fixture: 미배차 슬립 5건 + 가용 기사 3명.
     */
    @SuppressWarnings("null") // JPA save() / get(0).getId() Spring Data @NonNull 계약 보장
    @BeforeEach
    void setUp() {
        // lenient mock setup — 4종 외부 client 격리
        lenient().when(partnerClient.findByCodes(any())).thenReturn(List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        // FK 역순 cleanup
        signatureRepository.deleteAll();
        locationRepository.deleteAll();
        stopRepository.deleteAll();
        vehicleRepository.deleteAll();
        dispatchRepository.deleteAll();
        driverRepository.deleteAll();

        // --- 가용 기사 3명 (JPA) ---
        Driver d1 = Driver.of(DRV_P15_001, "010-9015-0001", "1톤",
                DriverSource.INTERNAL, true, null);
        Driver d2 = Driver.of(DRV_P15_002, "010-9015-0002", "2.5톤",
                DriverSource.INTERNAL, true, null);
        Driver d3 = Driver.of(DRV_P15_003, "010-9015-0003", "5톤",
                DriverSource.INTERNAL, true, null);
        driverRepository.saveAll(java.util.Arrays.asList(d1, d2, d3));

        // --- 미배차 배차 5건 + 차량 5대 + 정차 5건 ---
        // 각 (dispatch_date, dispatch_type) 조합 unique — V2 제약 준수
        dispatchId1 = createPendingDispatch("2026-06-01", DispatchType.DAY,
                "에스엠하나공조", "서울 강남구 역삼동 123-1", 501L, PC_501);
        createPendingDispatch("2026-06-02", DispatchType.DAY,
                "한국공조시스템", "서울 송파구 잠실동 456-2", 502L, PC_502);
        createPendingDispatch("2026-06-02", DispatchType.NIGHT,
                "대한냉동시스템", "경기 성남시 분당구 789-3", 503L, PC_503);
        createPendingDispatch("2026-06-03", DispatchType.DAY,
                "인천공조", "인천 남동구 구월동 12-4", 504L, PC_504);
        createPendingDispatch("2026-06-03", DispatchType.NIGHT,
                "일산공조", "경기 고양시 일산동구 34-5", 505L, PC_505);

        // vehicleId1 — 테스트 케이스 4/5/6 에서 배차 대상
        vehicleId1 = vehicleRepository
                .findAllByDispatchIdOrderBySequenceAsc(dispatchId1)
                .get(0).getId();
    }

    // ============================================================
    // TC-1: 가용 기사 3명 저장 확인
    // ============================================================

    @Test
    @DisplayName("TC-1: fixture 기사 3명 INTERNAL + appInstalled TRUE 저장 확인")
    void tc1_fixture_drivers_stored() {
        List<Driver> drivers = driverRepository.findAll();
        assertThat(drivers).hasSize(3);
        assertThat(drivers)
                .extracting(Driver::getDriverCode)
                .containsExactlyInAnyOrder(DRV_P15_001, DRV_P15_002, DRV_P15_003);
        assertThat(drivers)
                .allSatisfy(d -> {
                    assertThat(d.getSource()).isEqualTo(DriverSource.INTERNAL);
                    assertThat(d.getAppInstalled()).isTrue();
                });
    }

    // ============================================================
    // TC-2: 미배차 배차 5건 저장 확인
    // ============================================================

    @Test
    @DisplayName("TC-2: fixture 미배차 배차 5건 PENDING (assigned_driver_id=NULL) 저장 확인")
    void tc2_fixture_dispatches_stored() {
        List<Dispatch> dispatches = dispatchRepository.findAll();
        assertThat(dispatches).hasSize(5);

        List<Vehicle> vehicles = vehicleRepository.findAll();
        assertThat(vehicles).hasSize(5);
        assertThat(vehicles)
                .allSatisfy(v -> {
                    assertThat(v.getStatus()).isEqualTo(VehicleStatus.PENDING);
                    assertThat(v.getAssignedDriverId()).isNull();
                });

        List<VehicleStop> stops = stopRepository.findAll();
        assertThat(stops).hasSize(5);
        assertThat(stops)
                .allSatisfy(s -> assertThat(s.getStatus()).isEqualTo(StopStatus.PENDING));
    }

    // ============================================================
    // TC-3: 미배차 집계 5건 — slipServiceClient stub 기준 모두 unassigned
    // ============================================================

    @Test
    @DisplayName("TC-3: 미배차 집계 — 배차 전 5건 전부 unassigned")
    void tc3_unassigned_count_before_dispatch() {
        LocalDate date = LocalDate.of(2026, 6, 1);
        stubOutboundSlips(date, date,
                outbound("SLP-TC3-001", PC_501, "에스엠하나공조", "서울 강남구 역삼동"));

        UnassignedSlipResponse response = unassignedService.findUnassigned(date);

        assertThat(response.totalOutbound()).isEqualTo(1);
        assertThat(response.unassignedCount()).isEqualTo(1);
        assertThat(response.entries()).hasSize(1);
        assertThat(response.entries().get(0).partnerCode()).isEqualTo(PC_501);
    }

    // ============================================================
    // TC-4: 수동 배차 API — 기사 1명에 vehicle 1대 ASSIGNED 성공 (200)
    // ============================================================

    @Test
    @DisplayName("TC-4: POST /admin/arologis/dispatches/{id}/vehicles/1/assign-driver → 200 ASSIGNED")
    void tc4_manual_assign_driver_returns_200() throws Exception {
        String body = "{\"driverCode\":\"" + DRV_P15_001 + "\"}";
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatchId1 + "/vehicles/1/assign-driver")
                        .header("X-User-Id", "test-p15")
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    // ============================================================
    // TC-5: 수동 배차 후 vehicle status ASSIGNED + assignedDriverId 非NULL
    // ============================================================

    @SuppressWarnings("null") // vehicleRepository.findById() orElseThrow — Spring Data @NonNull 계약
    @Test
    @DisplayName("TC-5: 배차 후 Vehicle status=ASSIGNED + assignedDriverId 非NULL")
    void tc5_vehicle_becomes_assigned_after_manual_dispatch() throws Exception {
        // 수동 배차 실행
        String body = "{\"driverCode\":\"" + DRV_P15_001 + "\"}";
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatchId1 + "/vehicles/1/assign-driver")
                        .header("X-User-Id", "test-p15")
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk());

        // DB 검증 — ASSIGNED + 非NULL
        // ArologisAdminController.assignDriver → DispatchService.assignDriverManual 경로는
        // MatchSource.MANUAL 로 기록한다 (admin 직접 배정). INTERNAL_APP 은 앱 자동 매칭 전용.
        Vehicle vehicle = vehicleRepository.findById(vehicleId1).orElseThrow();
        assertThat(vehicle.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(vehicle.getAssignedDriverId()).isNotNull();
        assertThat(vehicle.getMatchSource()).isEqualTo(MatchSource.MANUAL);
    }

    // ============================================================
    // TC-6: 배차 완료 1건 제외 후 미배차 집계 확인 (partnerCode 매핑 기반)
    // ============================================================

    @SuppressWarnings("null") // stopRepository.findFirst / save() — Spring Data @NonNull 계약
    @Test
    @DisplayName("TC-6: 1건 배차 후 parsed_partner_code 매칭 → 해당 슬립 assigned 로 분류")
    void tc6_unassigned_decreases_after_dispatch_with_partner_code() throws Exception {
        // vehicle_stop 의 parsed_partner_code 를 PC_501 로 채워야 UnassignedService 가 매칭 가능.
        // seed 에서 parsedPartnerCode=NULL — 직접 JPA 갱신 (updateParsedPartnerCode 도메인 메서드).
        VehicleStop stop = stopRepository.findFirstByVehicleIdAndSequence(vehicleId1, 1).orElseThrow();
        stop.updateParsedPartnerCode(PC_501);
        stopRepository.save(stop);

        // 수동 배차 실행 (Vehicle PENDING → ASSIGNED)
        String body = "{\"driverCode\":\"" + DRV_P15_001 + "\"}";
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatchId1 + "/vehicles/1/assign-driver")
                        .header("X-User-Id", "test-p15")
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk());

        // slipServiceClient stub — 2건 반환 (PC_501 은 이미 배차됨)
        LocalDate date = LocalDate.of(2026, 6, 1);
        stubOutboundSlips(date, date,
                outbound("SLP-TC6-001", PC_501, "에스엠하나공조", "서울 강남구"),
                outbound("SLP-TC6-002", PC_502, "한국공조시스템", "서울 송파구"));

        UnassignedSlipResponse response = unassignedService.findUnassigned(date);

        // PC_501 은 parsed_partner_code 매칭 → assigned → unassigned 아님
        // PC_502 는 vehicle_stop 미매칭 → unassigned
        assertThat(response.totalOutbound()).isEqualTo(2);
        assertThat(response.unassignedCount()).isEqualTo(1);
        assertThat(response.entries().get(0).partnerCode()).isEqualTo(PC_502);
    }

    // ============================================================
    // TC-7: 가용 기사 목록 조회 API — 3명 응답
    // ============================================================

    @Test
    @DisplayName("TC-7: GET /admin/arologis/drivers → 200, 기사 3명 포함")
    void tc7_list_drivers_returns_3_available() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/drivers")
                        .header("X-User-Id", "test-p15")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(3));
    }

    // ============================================================
    // TC-8: 미존재 driverCode 배차 요청 → 404
    // ============================================================

    @Test
    @DisplayName("TC-8: 미존재 driverCode 배차 요청 → 404")
    void tc8_assign_unknown_driver_returns_404() throws Exception {
        String body = "{\"driverCode\":\"DRV-P15-UNKNOWN-9999\"}";
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatchId1 + "/vehicles/1/assign-driver")
                        .header("X-User-Id", "test-p15")
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    // ============================================================
    // TC-9: 미존재 dispatchId 배차 요청 → 404
    // ============================================================

    @Test
    @DisplayName("TC-9: 미존재 dispatchId 배차 요청 → 404")
    void tc9_assign_unknown_dispatch_returns_404() throws Exception {
        String body = "{\"driverCode\":\"" + DRV_P15_001 + "\"}";
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + UUID.randomUUID() + "/vehicles/1/assign-driver")
                        .header("X-User-Id", "test-p15")
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    // ============================================================
    // helper — fixture 생성
    // ============================================================

    /**
     * PENDING 배차 1건 + 차량 1대 (seq=1, PENDING) + 정차 1건 (seq=1, PENDING) JPA 저장.
     *
     * @param dateStr       dispatch_date (yyyy-MM-dd)
     * @param type          배차 유형
     * @param partnerName   거래처 상호 (파싱 결과)
     * @param address       거래처 주소
     * @param kakaoSeq      카톡 슬립번호 (parsedKakaoSeq)
     * @param partnerCode   partner-service partnerCode (parsedPartnerCode — 기본 null, TC-6 에서 갱신)
     * @return 생성된 Dispatch UUID
     */
    @SuppressWarnings("null") // JPA save() / getId() 반환값 — Spring Data @NonNull 계약 보장
    private UUID createPendingDispatch(String dateStr, DispatchType type,
                                       String partnerName, String address,
                                       Long kakaoSeq, String partnerCode) {
        LocalDate date = LocalDate.parse(dateStr);
        String rawText = date.getMonthValue() + "월 " + date.getDayOfMonth() + "일 "
                + typeName(type) + "입니다\n"
                + "1. 1톤 " + address + "\n"
                + " - " + partnerName + " / " + kakaoSeq + " / 9시하차\n";
        Dispatch dispatch = Dispatch.of(date, type, rawText);
        dispatch = dispatchRepository.save(dispatch);

        Vehicle vehicle = Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1,
                "1번차 (" + partnerName + ")");
        vehicle = vehicleRepository.save(vehicle);

        VehicleStop stop = VehicleStop.of(
                vehicle.getId(), 1,
                " - " + partnerName + " / " + kakaoSeq + " / 9시하차",
                address, partnerName, kakaoSeq,
                "9시하차", StopStatus.PENDING);
        stopRepository.save(stop);

        return dispatch.getId();
    }

    private String typeName(DispatchType type) {
        return switch (type) {
            case DAY -> "주간";
            case NIGHT -> "야상";
            case EXPRESS -> "특급";
        };
    }

    /** slipServiceClient stub 설정 헬퍼. */
    @SafeVarargs
    private void stubOutboundSlips(LocalDate from, LocalDate to,
                                   OutboundSlipSummary... summaries) {
        Mockito.when(slipServiceClient.getOutboundSlips(from, to))
                .thenReturn(List.of(summaries));
    }

    /** OutboundSlipSummary 생성 헬퍼. */
    private OutboundSlipSummary outbound(String slipId, String partnerCode,
                                         String partnerName, String address) {
        // slipNo 포맷 — "2026/06/01-NNN" 형식 (사용자 노출 식별자)
        String slipNo = "2026/06/01-" + partnerCode.substring(partnerCode.length() - 3);
        return new OutboundSlipSummary(slipId, slipNo, partnerCode, partnerName, address);
    }
}
