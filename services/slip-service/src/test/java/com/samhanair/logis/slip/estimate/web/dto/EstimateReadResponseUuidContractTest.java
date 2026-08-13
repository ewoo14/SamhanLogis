package com.samhanair.logis.slip.estimate.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EstimateReadResponseUuidContractTest {
    private static final String UUID_PATTERN =
            "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

    @Test
    void listResponseBodyContainsNoUuidAnywhere() throws Exception {
        var response = new EstimateReadResponse(
                "2026/08/13-1", "2026/08/13-1", LocalDate.of(2026, 8, 13), 1,
                EstimateStatus.QUOTE_DRAFT, "거래처", "1234567890",
                LocalDate.of(2026, 9, 1), BigDecimal.ONE, BigDecimal.ONE, BigDecimal.valueOf(2),
                LocalDateTime.now(), null, null, 1L, false, null, null, false);

        assertThat(new ObjectMapper().findAndRegisterModules().writeValueAsString(response))
                .doesNotContainPattern(UUID_PATTERN);
    }

    @Test
    void detailResponseBodyContainsNoUuidAnywhereIncludingLines() throws Exception {
        var line = new EstimateDetailReadResponse.EstimateLineReadResponse(
                "1", 1, "품목", "모델", null, "USER", 1,
                BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.ONE, null, null,
                false, null, null);
        var response = new EstimateDetailReadResponse(
                "2026/08/13-1", "2026/08/13-1", LocalDate.of(2026, 8, 13), 1,
                EstimateStatus.QUOTE_DRAFT, "거래처", "1234567890", "주소",
                LocalDate.of(2026, 9, 1), BigDecimal.ONE, BigDecimal.ONE, BigDecimal.valueOf(2),
                null, LocalDateTime.now(), null, null, null, null, 1L, false, null, null, List.of(line));

        assertThat(new ObjectMapper().findAndRegisterModules().writeValueAsString(response))
                .doesNotContainPattern(UUID_PATTERN);
    }
}
