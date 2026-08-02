package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.client.SlipServiceClient.OutboundSlipSummary;
import com.samhanair.logis.arologis.domain.RegionDispatchClassification;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.dto.PreClassifyResponse;
import com.samhanair.logis.arologis.dto.PreClassifyResponse.Entry;
import com.samhanair.logis.arologis.repository.RegionDispatchClassificationRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * PreClassifyService 단위 테스트 — Phase 10 PR-E1 BE-A2.
 *
 * <p>RegionClassifier 통합 + 권역 그룹핑 5 case:
 *
 * <ol>
 *   <li>case 1 — 정상 케이스 다중 권역 그룹핑</li>
 *   <li>case 2 — 미매칭 슬립은 unclassified 영역</li>
 *   <li>case 3 — slip-service 빈 응답 → 빈 결과 (graceful empty)</li>
 *   <li>case 4 — dispatchPlanned 플래그 vehicle_stops 매칭 정확성</li>
 *   <li>case 5 — from/to 검증 (null + to&lt;from)</li>
 * </ol>
 */
class PreClassifyServiceTest {

    private SlipServiceClient slipServiceClient;
    private RegionClassifier regionClassifier;
    private VehicleStopRepository vehicleStopRepository;
    private PreClassifyService service;

    @BeforeEach
    void setUp() {
        slipServiceClient = mock(SlipServiceClient.class);
        vehicleStopRepository = mock(VehicleStopRepository.class);
        // RegionClassifier 는 실제 구현 — 노션 export CSV 19+ 그룹 일부 mock 으로 시드
        RegionDispatchClassificationRepository regionRepo =
                mock(RegionDispatchClassificationRepository.class);
        when(regionRepo.findAllByOrderBySortOrderAscGroupNameAsc()).thenReturn(List.of(
                RegionDispatchClassification.of("서울특별시",
                        "송파구, 강남구, 서초구, 강동구, 광진구, 영등포구, 관악구, 강서구, 구로구, 양천구, 마포구, 종로구, 중구",
                        1),
                RegionDispatchClassification.of("경기남부",
                        "수원, 성남, 용인, 화성, 오산, 평택, 안성", 3),
                RegionDispatchClassification.of("인천광역시",
                        "중구, 동구, 미추홀구, 연수구, 남동구, 부평구, 계양구, 서구, 강화, 옹진", 6)
        ));
        regionClassifier = new RegionClassifier(regionRepo);
        service = new PreClassifyService(slipServiceClient, regionClassifier, vehicleStopRepository);
    }

    @Test
    @DisplayName("case 1 — 정상 케이스 다중 권역 그룹핑")
    void classify_groups_by_region() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                        "에스엠하나공조", "서울 강남구 역삼동"),
                new OutboundSlipSummary("id-2", "2026/05/10-002", "P-2026-0002",
                        "대한공조", "서울 송파구 잠실동"),
                new OutboundSlipSummary("id-3", "2026/05/10-003", "P-2026-0003",
                        "수원공조", "수원시 영통구 매탄동"),
                new OutboundSlipSummary("id-4", "2026/05/10-004", "P-2026-0004",
                        "인천공조", "인천 남동구 구월동")
        ));
        when(vehicleStopRepository.findAllByParsedPartnerCodeIn(any())).thenReturn(List.of());

        PreClassifyResponse result = service.classify(
                LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 10));

        assertThat(result.regionGroups()).containsKeys("서울특별시", "경기남부", "인천광역시");
        assertThat(result.regionGroups().get("서울특별시")).hasSize(2);
        assertThat(result.regionGroups().get("경기남부")).hasSize(1);
        assertThat(result.regionGroups().get("인천광역시")).hasSize(1);
        assertThat(result.unclassified()).isEmpty();
    }

    @Test
    @DisplayName("case 2 — 미매칭 슬립은 unclassified 영역")
    void classify_unmatched_goes_to_unclassified() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                        "외국공조", "Tokyo Shibuya"),
                new OutboundSlipSummary("id-2", "2026/05/10-002", "P-2026-0002",
                        "주소없음공조", null),
                new OutboundSlipSummary("id-3", "2026/05/10-003", "P-2026-0003",
                        "서울공조", "서울 강남구 역삼동")
        ));
        when(vehicleStopRepository.findAllByParsedPartnerCodeIn(any())).thenReturn(List.of());

        PreClassifyResponse result = service.classify(
                LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 10));

        assertThat(result.regionGroups()).containsOnlyKeys("서울특별시");
        assertThat(result.unclassified()).hasSize(2);
        assertThat(result.unclassified()).extracting(Entry::slipNo)
                .containsExactlyInAnyOrder("2026/05/10-001", "2026/05/10-002");
    }

    @Test
    @DisplayName("case 3 — slip-service 빈 응답 → 빈 결과 (graceful empty)")
    void classify_emptySlips_returnsEmptyResponse() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());

        PreClassifyResponse result = service.classify(
                LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 10));

        assertThat(result.regionGroups()).isEmpty();
        assertThat(result.unclassified()).isEmpty();
    }

    @Test
    @DisplayName("case 4 — dispatchPlanned 플래그 vehicle_stops 매칭 정확성")
    void classify_dispatchPlanned_marks_assigned_partners() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                        "이미배차공조", "서울 강남구 역삼동"),
                new OutboundSlipSummary("id-2", "2026/05/10-002", "P-2026-0002",
                        "미배차공조", "서울 송파구 잠실동")
        ));
        // P-2026-0001 만 vehicle_stops 에 매칭 → dispatchPlanned=true
        VehicleStop matched = VehicleStop.of(
                UUID.randomUUID(), 1, "raw line",
                "서울 강남구 역삼동", "이미배차공조", null, null, StopStatus.PENDING,
                "서울특별시", "P-2026-0001");
        when(vehicleStopRepository.findAllByParsedPartnerCodeIn(any())).thenReturn(List.of(matched));

        PreClassifyResponse result = service.classify(
                LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 10));

        List<Entry> seoul = result.regionGroups().get("서울특별시");
        assertThat(seoul).hasSize(2);
        Entry already = seoul.stream().filter(e -> "P-2026-0001".equals(e.partnerCode())).findFirst().orElseThrow();
        Entry pending = seoul.stream().filter(e -> "P-2026-0002".equals(e.partnerCode())).findFirst().orElseThrow();
        assertThat(already.dispatchPlanned()).isTrue();
        assertThat(pending.dispatchPlanned()).isFalse();
    }

    @Test
    @DisplayName("case 5 — from/to 검증 (null + to<from)")
    void classify_invalidRange_throwsBusinessException() {
        assertThatThrownBy(() -> service.classify(null, LocalDate.of(2026, 5, 10)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("from/to");
        assertThatThrownBy(() -> service.classify(LocalDate.of(2026, 5, 10), null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("from/to");
        assertThatThrownBy(() -> service.classify(
                LocalDate.of(2026, 5, 11), LocalDate.of(2026, 5, 10)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    @DisplayName("mode 2 — 창고명이 없으면 초월 창고로 판정하지 않는다")
    void classify_chowolMode_doesNotAcceptMissingWarehouse() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                        "창고 미상 거래처", "서울 강남구 역삼동")
        ));
        when(vehicleStopRepository.findAllByParsedPartnerCodeIn(any())).thenReturn(List.of());

        PreClassifyResponse result = service.classify(
                LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 10),
                DispatchExecutionMode.CHOWOL_REGION_EXCLUDED);

        assertThat(result.regionGroups()).isEmpty();
        assertThat(result.unclassified()).isEmpty();
    }

    @Test
    @DisplayName("8개 실행 모드 — 레거시 창고명·delivery_tag 판정 행렬")
    void classify_eightExecutionModes_followLegacyWarehouseAndTagMatrix() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                outbound("sangil", "상일창고", null),
                outbound("chowol", "초월창고", null),
                outbound("sangil-region", "상일창고", "REGION"),
                outbound("chowol-region", "초월창고", "REGION"),
                outbound("sangil-stack", "상일창고", "STACK"),
                outbound("chowol-stack", "초월창고", "STACK")
        ));
        when(vehicleStopRepository.findAllByParsedPartnerCodeIn(any())).thenReturn(List.of());

        Map<DispatchExecutionMode, Integer> expected = new EnumMap<>(DispatchExecutionMode.class);
        expected.put(DispatchExecutionMode.SANGIL_AND_CHOWOL_REGION_EXCLUDED, 4);
        expected.put(DispatchExecutionMode.CHOWOL_REGION_EXCLUDED, 2);
        expected.put(DispatchExecutionMode.SANGIL_REGION_EXCLUDED, 2);
        expected.put(DispatchExecutionMode.STACK_ONLY, 2);
        expected.put(DispatchExecutionMode.REGION_ONLY, 2);
        expected.put(DispatchExecutionMode.SANGIL_AND_CHOWOL_REGION_INCLUDED, 6);
        expected.put(DispatchExecutionMode.CHOWOL_REGION_INCLUDED, 3);
        expected.put(DispatchExecutionMode.SANGIL_REGION_INCLUDED, 3);

        for (Map.Entry<DispatchExecutionMode, Integer> entry : expected.entrySet()) {
            PreClassifyResponse result = service.classify(
                    LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 10), entry.getKey());
            int classified = result.regionGroups().values().stream().mapToInt(List::size).sum();
            assertThat(classified)
                    .as("mode=%s", entry.getKey())
                    .isEqualTo(entry.getValue());
            assertThat(result.unclassified()).as("mode=%s", entry.getKey()).isEmpty();
        }
    }

    private static OutboundSlipSummary outbound(String id, String warehouse, String deliveryTag) {
        return new OutboundSlipSummary(id, "2026/05/10-" + id, "P-" + id,
                "거래처-" + id, "서울 강남구 역삼동", deliveryTag, warehouse,
                null, null, null, "2026-05-10");
    }
}
