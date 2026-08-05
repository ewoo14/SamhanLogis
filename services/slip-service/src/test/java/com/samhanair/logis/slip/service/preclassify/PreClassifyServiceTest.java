package com.samhanair.logis.slip.service.preclassify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import com.samhanair.logis.slip.service.preclassify.PreClassifyResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** S2 RED-B: 기존 PreClassifyServiceTest의 8모드/제외/야적 보존 케이스를 삼한 위치에 이전한다. */
class PreClassifyServiceTest {
    private PreClassifySlipQuery slipQuery;
    private PreClassifySupportClient supportClient;
    private PreClassifyService service;

    @BeforeEach
    void setUp() {
        slipQuery = mock(PreClassifySlipQuery.class);
        supportClient = mock(PreClassifySupportClient.class);
        when(supportClient.getSupport(any())).thenReturn(new PreClassifySupport(
                List.of(new RegionRule("서울특별시", "송파구, 강남구, 서초구", 1)),
                List.of()));
        when(slipQuery.find(any(), any())).thenReturn(List.of(
                outbound("sangil", "SANGIL", null, "서울 강남구"),
                outbound("chowol", "CHOWOL", null, "서울 강남구"),
                outbound("sangil-region", "SANGIL", "REGION", "서울 강남구"),
                outbound("chowol-region", "CHOWOL", "REGION", "서울 강남구"),
                outbound("sangil-stack", "SANGIL", "STACK", "서울 강남구"),
                outbound("chowol-stack", "CHOWOL", "STACK", "서울 강남구")));
        service = new PreClassifyService(slipQuery, supportClient);
    }

    @Test
    void classify_returnsEightModeResults_fromSamhanService() {
        Map<DispatchExecutionMode, Integer> expected = new EnumMap<>(DispatchExecutionMode.class);
        expected.put(DispatchExecutionMode.SANGIL_AND_CHOWOL_REGION_EXCLUDED, 4);
        expected.put(DispatchExecutionMode.CHOWOL_REGION_EXCLUDED, 3);
        expected.put(DispatchExecutionMode.SANGIL_REGION_EXCLUDED, 3);
        expected.put(DispatchExecutionMode.STACK_ONLY, 2);
        expected.put(DispatchExecutionMode.REGION_ONLY, 2);
        expected.put(DispatchExecutionMode.SANGIL_AND_CHOWOL_REGION_INCLUDED, 6);
        expected.put(DispatchExecutionMode.CHOWOL_REGION_INCLUDED, 4);
        expected.put(DispatchExecutionMode.SANGIL_REGION_INCLUDED, 4);

        for (Map.Entry<DispatchExecutionMode, Integer> entry : expected.entrySet()) {
            int actual = service.classify(LocalDate.of(2026, 8, 4), LocalDate.of(2026, 8, 4), entry.getKey())
                    .regionGroups().values().stream().mapToInt(List::size).sum();
            assertThat(actual).as("mode=%s", entry.getKey()).isEqualTo(entry.getValue());
        }
    }

    @Test
    void classify_preservesCommonExclusionAndStackBeforeWarehouse() {
        when(slipQuery.find(any(), any())).thenReturn(List.of(
                outbound("carrier", "SANGIL", null, "서울 경동택배/강남구"),
                outbound("stack", "UNKNOWN", "STACK", "서울 강남구"),
                outbound("region", "UNKNOWN", "REGION", "서울 강남구")));

        var result = service.classify(LocalDate.of(2026, 8, 4), LocalDate.of(2026, 8, 4),
                DispatchExecutionMode.SANGIL_AND_CHOWOL_REGION_EXCLUDED);

        assertThat(result.regionGroups().values()).flatExtracting(x -> x)
                .extracting(PreClassifyResponse.Entry::slipNo).containsExactly("stack");
        assertThat(result.unknownWarehouseCount()).isEqualTo(1);
    }

    @Test
    void classify_unmatchedAndUnknownWarehouseKeepLegacyResponseShape() {
        when(slipQuery.find(any(), any())).thenReturn(List.of(
                new PreClassifySlip("unknown", "P-unknown", "미상", "Tokyo", null, "UNKNOWN"),
                new PreClassifySlip("matched", "P-matched", "서울", "서울 강남구", null, "SANGIL")));
        var result = service.classify(LocalDate.of(2026, 8, 4), LocalDate.of(2026, 8, 4), null);
        assertThat(result.unknownWarehouseCount()).isEqualTo(1);
        assertThat(result.unclassified()).extracting(PreClassifyResponse.Entry::slipNo).containsExactly("unknown");
    }

    @Test
    void classify_marksPlannedPartnerFromArologisSupportData() {
        when(supportClient.getSupport(any())).thenReturn(new PreClassifySupport(
                List.of(new RegionRule("서울특별시", "강남구", 1)), List.of("P-sangil")));
        when(slipQuery.find(any(), any())).thenReturn(List.of(
                new PreClassifySlip("planned", "P-sangil", "서울", "서울 강남구", null, "SANGIL")));
        var entry = service.classify(LocalDate.of(2026, 8, 4), LocalDate.of(2026, 8, 4),
                DispatchExecutionMode.SANGIL_AND_CHOWOL_REGION_EXCLUDED).regionGroups()
                .get("서울특별시").get(0);
        assertThat(entry.dispatchPlanned()).isTrue();
    }

    @Test
    void classify_rejectsInvalidRange() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.classify(
                LocalDate.of(2026, 8, 5), LocalDate.of(2026, 8, 4), null))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class);
    }

    private static PreClassifySlip outbound(String id, String warehouse, String tag, String address) {
        return new PreClassifySlip(id, "P-" + id, "거래처-" + id, address, tag, warehouse);
    }
}
