package com.samhanair.logis.slip.estimate.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import java.math.BigDecimal;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** 견적 read 응답의 URL 식별자는 업무 문서번호가 아닌 URL-safe opaque token이어야 한다. */
class EstimateOpaqueIdentifierContractTest {

    private static final UUID ESTIMATE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final String OPAQUE_TOKEN = "AAAAAAAAAAAAAAAAAAAAAQ";

    @Test
    void listResponse_usesOpaqueTokenAndKeepsOriginalEstimateNumberSeparately() {
        EstimateResponse source = new EstimateResponse(
                ESTIMATE_ID, "2026/08/10-9", null, 9, EstimateStatus.QUOTE_DRAFT,
                null, "거래처", null, null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                null, null, null, null, null, 0L, false, null, null, false);

        EstimateReadResponse response = EstimateReadResponse.from(source);

        assertThat(response.id()).isEqualTo(OPAQUE_TOKEN);
        assertThat(response.estimateNo()).isEqualTo("2026/08/10-9");
        assertThat(response.id()).doesNotContain("00000000-0000-0000-0000-000000000001");
    }

    @Test
    void detailResponse_usesOpaqueTokenAndKeepsOriginalEstimateNumberSeparately() {
        EstimateDetailResponse source = new EstimateDetailResponse(
                ESTIMATE_ID, "2026/08/10-9", null, 9, EstimateStatus.QUOTE_DRAFT,
                null, "거래처", null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                null, null, null, null, null, null, null, 0L, false, null, null, java.util.List.of());

        EstimateDetailReadResponse response = EstimateDetailReadResponse.from(source);

        assertThat(response.id()).isEqualTo(OPAQUE_TOKEN);
        assertThat(response.estimateNo()).isEqualTo("2026/08/10-9");
    }

    @Test
    void mutationResponse_doesNotSerializeUuidFields() throws Exception {
        EstimateResponse source = new EstimateResponse(
                ESTIMATE_ID, "2026/08/10-9", null, 9, EstimateStatus.QUOTE_DRAFT,
                ESTIMATE_ID, "거래처", null, null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                ESTIMATE_ID, null, null, null, null, 0L, false, null, null, false);

        String json = new ObjectMapper().writeValueAsString(source);

        assertThat(json).contains("\"id\":\"" + OPAQUE_TOKEN + "\"");
        assertThat(json).doesNotContain(ESTIMATE_ID.toString());
    }
}
