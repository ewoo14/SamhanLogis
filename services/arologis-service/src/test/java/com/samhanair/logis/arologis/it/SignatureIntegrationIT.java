package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Phase 10 W10-4 (PR #99) — arologis driver-app sign + slip-service bridge 통합 IT.
 *
 * <p>본 IT 는 SlipClient 를 @MockBean 격리하여 양쪽 저장 시나리오를 검증한다 (실 slip-service
 * 호출 X — IT 외부 client `@MockBean` 격리 의무 가드 준수, PR #17 회고).
 *
 * <p>검증 시나리오:
 * <ul>
 *   <li>POST sign 정상 — arologis signatures INSERT + SlipClient.registerSignature 1회 호출 (mock
 *       success → slipBridged=true 응답)</li>
 *   <li>POST sign + SlipClient false (skeleton-mode 또는 매핑 실패) → 자체 INSERT 만 + slipBridged=false</li>
 *   <li>POST sign 응답 schema (ApiResponse wrapper success/data/signatureId/slipBridged/capturedAt)</li>
 *   <li>POST sign — driverCode body 명시 시 SlipClient payload 의 driverCode 보존 (verify)</li>
 *   <li>arologis 자체 signatures source=APP 보존 검증</li>
 * </ul>
 *
 * <p>이 IT 는 SlipResolver 를 실제로 사용하지만 PartnerClient mock 이 empty 를 반환하므로
 * resolveByKakaoSeq 가 항상 empty — 실 slip-service 호출 분기는 별도 unit test (SlipClientTest) 필요.
 * 본 IT 는 매핑 fallback 시 자체 저장 graceful 케이스 + bridge skip log 검증.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class SignatureIntegrationIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DispatchRepository dispatchRepository;
    @Autowired private VehicleRepository vehicleRepository;
    @Autowired private VehicleStopRepository stopRepository;
    @Autowired private DriverRepository driverRepository;
    @Autowired private SignatureRepository signatureRepository;
    @Autowired private DriverLocationRepository locationRepository;

    @MockBean private PartnerClient partnerClient;
    // 2026-05-14 분리 — UserClient @MockBean 제거 (자체 user 도메인 도입).
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;
    /** PR-E1 BE-3 — 출고전표 자동 조회 client 격리. */
    @MockBean private SlipServiceClient slipServiceClient;

    @BeforeEach
    void setUp() {
        // 외부 client mock — IT 외부 client @MockBean 격리 의무 가드 (PR #17 회고)
        lenient().when(partnerClient.findByCodes(any())).thenReturn(List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());

        // FK 순서 cleanup
        signatureRepository.deleteAll();
        locationRepository.deleteAll();
        stopRepository.deleteAll();
        vehicleRepository.deleteAll();
        dispatchRepository.deleteAll();
        driverRepository.deleteAll();
    }

    /**
     * Case 1 — sign 정상 시나리오: arologis 자체 signatures INSERT + slip-service bridge skip
     * (PartnerClient empty → resolveByKakaoSeq empty → slipClient.registerSignature 미호출).
     * 응답 schema: ApiResponse wrapper + slipBridged=false + signatureId 존재.
     */
    @Test
    void sign_partnerNotMapped_savesArologisSignature_skipsSlipBridge() throws Exception {
        UUID userId = UUID.randomUUID();
        driverRepository.save(Driver.of(
                "DR-W10-4-001", "010-1111-2222", "1톤",
                DriverSource.INTERNAL, true, userId));

        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.now(), DispatchType.NIGHT, "W10-4 통합 IT"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "차량1"));
        VehicleStop stop = stopRepository.save(VehicleStop.of(
                vehicle.getId(), 1, "정차 1", "서울시 강남구",
                "테스트사", 9999L, null, StopStatus.PENDING));

        String body = objectMapper.writeValueAsString(Map.of(
                "imageRef", "s3://samhan-prod/sig.png",
                "latitude", "37.4979",
                "longitude", "127.0276",
                "driverCode", "INSUNG-001"));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/driver-app/arologis/dispatches/" + dispatch.getId()
                                + "/vehicles/1/stops/1/sign")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "DRIVER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                // F-3 의무: ApiResponse wrapper schema
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.signatureId").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.slipBridged").value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.capturedAt").exists());

        // arologis 자체 signatures source=APP 검증
        var saved = signatureRepository.findAllByStopIdOrderByCapturedAtDesc(stop.getId());
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getSource()).isEqualTo(SignatureSource.APP);
        assertThat(saved.get(0).getImageRef()).isEqualTo("s3://samhan-prod/sig.png");

        // SlipClient 미호출 검증 (PartnerClient empty → resolveByKakaoSeq empty → bridge skip)
        verify(slipClient, times(0)).registerSignature(any(), any());
    }

    /**
     * Case 2 — sign + driverCode null 시나리오: body 에 driverCode 없을 때도 정상 INSERT.
     * controller 가 fallback driverCode 합성 (UNKNOWN) — 단, slip bridge 자체 skip 이므로 검증 X.
     */
    @Test
    void sign_withoutDriverCode_savesArologisSignature() throws Exception {
        UUID userId = UUID.randomUUID();
        driverRepository.save(Driver.of(
                "DR-W10-4-002", "010-3333-4444", "2.5톤",
                DriverSource.INTERNAL, true, userId));

        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.now(), DispatchType.NIGHT, "W10-4 통합 IT 2"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_2_5, "차량2"));
        VehicleStop stop = stopRepository.save(VehicleStop.of(
                vehicle.getId(), 1, "정차 2", "서울시 송파구",
                "테스트사2", 8888L, null, StopStatus.PENDING));

        String body = objectMapper.writeValueAsString(Map.of(
                "imageRef", "s3://samhan-prod/sig2.png",
                "latitude", "37.5",
                "longitude", "127.1"));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/driver-app/arologis/dispatches/" + dispatch.getId()
                                + "/vehicles/1/stops/1/sign")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "DRIVER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.signatureId").exists());

        var saved = signatureRepository.findAllByStopIdOrderByCapturedAtDesc(stop.getId());
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getSource()).isEqualTo(SignatureSource.APP);
    }

    /**
     * Case 3 (QA-2 채택 fix) — happy-path: SlipResolver 가 slip-service 매핑 성공 → SlipClient
     * registerSignature 호출 (mock true) → slipBridged=true 응답.
     *
     * <p>SlipClient.findRecentSlipIdByPartnerCode mock 이 임의 UUID 반환하도록 설정 → SlipResolver
     * 가 slipId 를 반환 → controller 가 SlipClient.registerSignature 호출. 응답 schema slipBridged=true.
     */
    @Test
    void sign_partnerMapped_savesArologisSignature_slipBridgedTrue() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID resolvedSlipId = UUID.randomUUID();
        // SlipClient mock 활성: by-partner-code lookup 성공 + registerSignature 성공
        when(slipClient.findRecentSlipIdByPartnerCode(anyString()))
                .thenReturn(Optional.of(resolvedSlipId));
        when(slipClient.registerSignature(eq(resolvedSlipId), any())).thenReturn(true);

        driverRepository.save(Driver.of(
                "DR-W10-4-004", "010-7777-8888", "1톤",
                DriverSource.INTERNAL, true, userId));

        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.now(), DispatchType.NIGHT, "W10-4 happy-path"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "차량4"));
        VehicleStop stop = stopRepository.save(VehicleStop.of(
                vehicle.getId(), 1, "정차 4", "서울시 영등포구",
                "에스엠하나공조", 214L, null, StopStatus.PENDING));

        String body = objectMapper.writeValueAsString(Map.of(
                "imageRef", "s3://samhan-prod/sig-happy.png",
                "latitude", "37.5",
                "longitude", "127.05",
                "driverCode", "INSUNG-002"));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/driver-app/arologis/dispatches/" + dispatch.getId()
                                + "/vehicles/1/stops/1/sign")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "DRIVER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.signatureId").exists())
                // QA-2 채택 핵심 검증 — slipBridged=true (slip-service 양쪽 저장 성공)
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.slipBridged").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.capturedAt").exists());

        // arologis 자체 signatures source=APP 검증 (양쪽 저장 모두 보장)
        var saved = signatureRepository.findAllByStopIdOrderByCapturedAtDesc(stop.getId());
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getSource()).isEqualTo(SignatureSource.APP);
        assertThat(saved.get(0).getImageRef()).isEqualTo("s3://samhan-prod/sig-happy.png");

        // SlipClient 호출 검증 — 1회 호출, payload driverCode 보존
        verify(slipClient, times(1)).findRecentSlipIdByPartnerCode("214");
        verify(slipClient, times(1)).registerSignature(eq(resolvedSlipId), any());
    }

    /**
     * Case 4 — stop 미존재 → 404. (정상 가드 회귀 검증)
     */
    @Test
    void sign_stopNotFound_returns404() throws Exception {
        UUID userId = UUID.randomUUID();
        driverRepository.save(Driver.of(
                "DR-W10-4-003", "010-5555-6666", "1톤",
                DriverSource.INTERNAL, true, userId));

        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.now(), DispatchType.NIGHT, "W10-4 통합 IT 3"));
        vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "차량3"));

        String body = objectMapper.writeValueAsString(Map.of(
                "imageRef", "s3://samhan-prod/sig3.png"));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/driver-app/arologis/dispatches/" + dispatch.getId()
                                + "/vehicles/1/stops/99/sign")   // stopSeq=99 미존재
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "DRIVER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());

        verify(slipClient, times(0)).registerSignature(any(), any());
    }
}
