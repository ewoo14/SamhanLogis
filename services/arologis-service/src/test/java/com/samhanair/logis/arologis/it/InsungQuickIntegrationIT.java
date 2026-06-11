package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.arologis.client.InsungQuickClient;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipDispatchTaskClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.client.dto.InsungDriverMatchResponse;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.dto.insung.InsungDeliveredRequest;
import com.samhanair.logis.arologis.dto.insung.InsungMatchResultRequest;
import com.samhanair.logis.arologis.dto.insung.InsungStatusUpdateRequest;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 인성데이타 퀵프로그램 vendor 통합 IT — Phase 10 W10-2.
 *
 * <p>SP-09-5 패턴 일관 ({@code @MockBean InsungQuickClient} lenient stub).
 * 실 Postgres testcontainer + sandbox-mode + webhook 3종 검증.
 *
 * <h2>5 케이스</h2>
 * <ol>
 *   <li>provider=insung-quick + sandbox-mode + requestMatch 성공 → Vehicle.status MATCHING → ASSIGNED</li>
 *   <li>webhook match-result 수신 → DB 반영 (Vehicle.status ASSIGNED, Driver upsert)</li>
 *   <li>webhook status-update DEPARTED 수신 → Vehicle.status DEPARTED</li>
 *   <li>webhook delivered 수신 → Signature 생성 + Vehicle.status DELIVERED</li>
 *   <li>RPC 예외 → DriverMatchResult.empty() + Vehicle.status PENDING 유지 (fail-soft)</li>
 * </ol>
 *
 * <p>모든 외부 RestClient {@code @MockBean} 격리 의무 (feedback_it_mockbean_external_clients.md).
 * {@code @MockBean DynamicPermissionClient} + lenient stub (SP-D3 cycle 3 회고 의무).
 */
@SpringBootTest(classes = ArologisServiceApplication.class,
        properties = {
                "samhan.arologis.matcher.provider=insung-quick",
                "samhan.arologis.matcher.insung-quick.sandbox-mode=true",
                "samhan.arologis.matcher.insung-quick.api-url=",
                "samhan.arologis.matcher.insung-quick.api-key=",
                "samhan.arologis.matcher.insung-quick.partner-id="
        })
@AutoConfigureMockMvc
@Transactional
class InsungQuickIntegrationIT extends AbstractPostgresIT {

    private static final LocalDate IT_BASE_DATE =
            LocalDate.now().plusDays(10_000 + Math.floorMod(System.nanoTime(), 10_000));

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DispatchRepository dispatchRepository;

    @Autowired
    private VehicleRepository vehicleRepository;

    @Autowired
    private VehicleStopRepository vehicleStopRepository;

    @Autowired
    private DriverRepository driverRepository;

    @Autowired
    private SignatureRepository signatureRepository;

    // ─── 외부 client @MockBean 격리 의무 ─────────────────────────────────

    /** 인성데이타 client MockBean — sandbox-mode 에서도 @MockBean 격리 필수 */
    @MockBean
    private InsungQuickClient insungQuickClient;

    @MockBean
    private PartnerClient partnerClient;

    @MockBean
    private SlipClient slipClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private SlipDispatchTaskClient slipDispatchTaskClient;

    /** SP-D3 cycle 3 회고 의무 — DynamicPermissionClient @MockBean 격리 */
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        // lenient stub — 각 IT 에서 필요한 것만 override
        lenient().when(partnerClient.findByCodes(any())).thenReturn(List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        // InsungQuickClient sandbox mock
        lenient().when(insungQuickClient.requestOrder(any(), anyList())).thenReturn("SANDBOX-IT-001");
        lenient().when(insungQuickClient.requestMatch(anyString()))
                .thenReturn(InsungDriverMatchResponse.matched(
                        "DRV-IT-001", "IT기사", "010-1111-2222", "1톤"));
        lenient().when(insungQuickClient.queryStatus(anyString()))
                .thenReturn(new com.samhanair.logis.arologis.client.dto.InsungOrderStatus(
                        "SANDBOX-IT-001", "ASSIGNED", "DRV-IT-001", "IT 상태 조회"));
    }

    // ─── TC-1: sandbox-mode requestMatch 성공 → Vehicle.status MATCHING → ASSIGNED ─

    @Test
    @DisplayName("TC-1: sandbox-mode + requestMatch 성공 → Vehicle.status ASSIGNED 전이")
    void tc1_sandboxMode_requestMatch_success_vehicle_assigned() throws Exception {
        Map<String, Object> req = Map.of(
                "samhanDispatchTaskId", UUID.randomUUID(),
                "taskCode", "SP-10-2-IT-001",
                "dispatchDate", IT_BASE_DATE.toString(),
                "vehicles", List.of(Map.of(
                        "sequence", 1,
                        "vehicleType", "TONNAGE_1",
                        "slips", List.of(Map.of(
                                "sequence", 1,
                                "slipId", UUID.randomUUID(),
                                "slipNumber", "IT-SLIP-001",
                                "partnerCode", "P-001",
                                "partnerName", "IT테스트",
                                "address", "서울시 강남구",
                                "recipientPhoneNumber", "010-1111-2222",
                                "notes", "인성 매처 실 흐름")))));

        mockMvc.perform(post("/internal/arologis/dispatches")
                        .header("X-Internal-Token", "test-internal-token")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.arologisDispatchId").exists());

        Vehicle saved = vehicleRepository.findByVendorOrderId("SANDBOX-IT-001").orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(saved.getMatchSource()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
        assertThat(saved.getVendorOrderId()).isEqualTo("SANDBOX-IT-001");
    }

    // ─── TC-2: webhook match-result 수신 → DB 반영 ────────────────────────

    @Test
    @DisplayName("TC-2: webhook match-result 수신 → DB Vehicle.status ASSIGNED 반영")
    void tc2_webhook_matchResult_assigns_vehicle() throws Exception {
        // vendor_order_id 가 설정된 Vehicle 준비
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(IT_BASE_DATE.plusDays(1), DispatchType.DAY, "IT test webhook"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 2, VehicleTonnage.TONNAGE_2_5, null));
        vehicle.markMatching();
        vehicle.updateVendorOrderId("WEBHOOK-ORD-002");
        vehicleRepository.save(vehicle);

        // match-result webhook payload
        InsungMatchResultRequest req = new InsungMatchResultRequest(
                "WEBHOOK-ORD-002", true,
                "DRV-WH-002", "웹훅기사", "010-2222-3333", "2.5톤", "서울12바3456", null);

        mockMvc.perform(post("/internal/arologis/insung/match-result")
                        .header("X-Internal-Token", "test-internal-token")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.received").value(true));

        // DB 반영 확인
        Vehicle updated = vehicleRepository.findById(vehicle.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);

        // Driver upsert 확인
        Driver savedDriver = driverRepository.findByDriverCode("INSUNG-DRV-WH-002").orElseThrow();
        assertThat(savedDriver.getDriverName()).isEqualTo("웹훅기사");
        assertThat(savedDriver.getPhoneNumber()).isEqualTo("010-2222-3333");
        assertThat(savedDriver.getVehicleType()).isEqualTo("2.5톤");
        assertThat(savedDriver.getVehiclePlateNumber()).isEqualTo("서울12바3456");
    }

    // ─── TC-3: webhook status-update DEPARTED → Vehicle.status DEPARTED ───

    @Test
    @DisplayName("TC-3: webhook status-update DEPARTED 수신 → Vehicle.status DEPARTED 전이")
    void tc3_webhook_statusUpdate_departed_transitions_vehicle() throws Exception {
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(IT_BASE_DATE, DispatchType.NIGHT, "IT test departed"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 3, VehicleTonnage.TONNAGE_1, null));
        vehicle.markMatching();
        vehicle.updateVendorOrderId("DEPARTED-ORD-003");
        Driver driver = driverRepository.save(
                Driver.of("INSUNG-DRV-003", "010-3333-4444", "1톤",
                        DriverSource.EXTERNAL_INSUNG_QUICK, Boolean.FALSE, null));
        vehicle.assignDriver(driver.getId(), MatchSource.EXTERNAL_INSUNG_QUICK, "DEPARTED-ORD-003");
        vehicleRepository.save(vehicle);

        InsungStatusUpdateRequest req = new InsungStatusUpdateRequest(
                "DEPARTED-ORD-003", "DEPARTED", null, null, null, null);

        mockMvc.perform(post("/internal/arologis/insung/status-update")
                        .header("X-Internal-Token", "test-internal-token")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        Vehicle updated = vehicleRepository.findById(vehicle.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(VehicleStatus.DEPARTED);
    }

    // ─── TC-4: webhook delivered → Signature 생성 + Vehicle DELIVERED ────

    @Test
    @DisplayName("TC-4: webhook delivered 수신 → Signature 생성 + Vehicle.status DELIVERED")
    void tc4_webhook_delivered_creates_signature_and_delivered_status() throws Exception {
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(IT_BASE_DATE.plusDays(2), DispatchType.DAY, "IT test delivered"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 4, VehicleTonnage.TONNAGE_1, null));
        vehicle.markMatching();
        vehicle.updateVendorOrderId("DELIVERED-ORD-004");
        Driver driver = driverRepository.save(
                Driver.of("INSUNG-DRV-004", "010-4444-5555", "1톤",
                        DriverSource.EXTERNAL_INSUNG_QUICK, Boolean.FALSE, null));
        vehicle.assignDriver(driver.getId(), MatchSource.EXTERNAL_INSUNG_QUICK, "DELIVERED-ORD-004");
        vehicle.markDeparted();
        vehicleRepository.save(vehicle);

        // stop 1건 생성
        VehicleStop stop = vehicleStopRepository.save(
                VehicleStop.of(vehicle.getId(), 1, "테스트주소 1",
                        "서울시 강남구", "테스트거래처", 101L, null, StopStatus.PENDING));
        stop.markArrived(java.time.LocalDateTime.now());
        vehicleStopRepository.save(stop);

        InsungDeliveredRequest req = new InsungDeliveredRequest(
                "DELIVERED-ORD-004", 1,
                "https://insung.example.com/sign/001.png",
                37.5665, 126.9780, "2026-05-19T10:30:00");

        mockMvc.perform(post("/internal/arologis/insung/delivered")
                        .header("X-Internal-Token", "test-internal-token")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(post("/internal/arologis/insung/delivered")
                        .header("X-Internal-Token", "test-internal-token")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // Vehicle DELIVERED 확인
        Vehicle updated = vehicleRepository.findById(vehicle.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(VehicleStatus.DELIVERED);
        assertThat(signatureRepository.findAllByStopIdOrderByCapturedAtDesc(stop.getId()))
                .hasSize(1)
                .first()
                .extracting("source")
                .isEqualTo(SignatureSource.EXTERNAL_INSUNG_LBS);
    }

    // ─── TC-5: RPC 예외 → fail-soft + Vehicle.status PENDING 유지 ─────────

    @Test
    @DisplayName("TC-5: RPC 예외 → DriverMatchResult.empty() + Vehicle.status PENDING 유지 (fail-soft)")
    void tc5_rpc_exception_returns_empty_and_pending_status() {
        // InsungQuickClient.requestOrder 예외 시뮬레이션
        when(insungQuickClient.requestOrder(any(), anyList()))
                .thenThrow(new RuntimeException("인성 서버 네트워크 오류 (IT 시뮬레이션)"));

        com.samhanair.logis.arologis.matcher.InsungQuickDriverMatcher failMatcher =
                new com.samhanair.logis.arologis.matcher.InsungQuickDriverMatcher(
                        insungQuickClient, driverRepository, vehicleRepository);

        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);

        com.samhanair.logis.arologis.matcher.DriverMatchResult result =
                failMatcher.match(vehicle, List.of());

        // fail-soft: empty 반환, Vehicle.status 는 PENDING 유지
        assertThat(result.driver()).isEmpty();
        assertThat(result.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
        assertThat(vehicle.getStatus()).isEqualTo(VehicleStatus.PENDING);
    }
}
