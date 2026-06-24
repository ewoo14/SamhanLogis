package com.samhanair.logis.slip.service.external;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class ExternalDispatchSmsComposerTest {

    private final ExternalDispatchSmsComposer composer = new ExternalDispatchSmsComposer();

    @Test
    void compose_singleSlip_containsHeaderAndSummary() {
        Slip slip = slip("2026/06/24-1", "서울시 강남구", List.of(line("AJ040", "무풍 4HP", 2)));

        String body = composer.compose("한빛퀵", LocalDate.of(2026, 6, 24), List.of(slip));

        assertThat(body)
                .contains("[배차의뢰] 한빛퀵 2026-06-24")
                .contains("2026/06/24-1 서울시 강남구 AJ040 2대");
    }

    @Test
    void compose_multipleSlipsAndLines_usesRepresentativeItemAndOtherCount() {
        Slip first = slip("2026/06/24-1", "서울시 강남구",
                List.of(line("AJ040", "무풍 4HP", 2), line("MWR", "리모컨", 3)));
        Slip second = slip("2026/06/24-2", "부산시 해운대구", List.of(line(null, "배관", 1)));

        String body = composer.compose("한빛퀵", LocalDate.of(2026, 6, 24), List.of(first, second));

        assertThat(body).contains("AJ040 5대 외 1건");
        assertThat(body).contains("2026/06/24-2 부산시 해운대구 배관 1대");
    }

    @Test
    void compose_over2000_truncatesSlipRowsWithRemainder() {
        List<Slip> slips = java.util.stream.IntStream.rangeClosed(1, 80)
                .mapToObj(i -> slip("2026/06/24-" + i, "경기도 성남시 분당구 판교로 ".repeat(4) + i,
                        List.of(line("AJ" + i, "제품" + i, i))))
                .toList();

        String body = composer.compose("장문배송", LocalDate.of(2026, 6, 24), slips);

        assertThat(body).hasSizeLessThanOrEqualTo(2000);
        assertThat(body).contains("…외 ");
    }

    @Test
    void compose_emptyLines_usesFallbackItemSummary() {
        Slip slip = slip("2026/06/24-1", "서울시 강남구", List.of());

        String body = composer.compose("한빛퀵", LocalDate.of(2026, 6, 24), List.of(slip));

        assertThat(body).contains("품목미지정");
    }

    private static Slip slip(String slipNo, String address, List<SlipLine> lines) {
        Slip slip = mock(Slip.class);
        when(slip.getSlipNo()).thenReturn(slipNo);
        when(slip.getDeliveryAddress()).thenReturn(address);
        when(slip.getDestinationWarehouseName()).thenReturn(null);
        when(slip.getLines()).thenReturn(lines);
        return slip;
    }

    private static SlipLine line(String modelName, String productName, int quantity) {
        SlipLine line = mock(SlipLine.class);
        when(line.getModelName()).thenReturn(modelName);
        when(line.getProductName()).thenReturn(productName);
        when(line.getQuantity()).thenReturn(quantity);
        return line;
    }
}
