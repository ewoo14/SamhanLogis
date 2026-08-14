package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModel;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModelService;
import com.samhanair.logis.accounting.web.dto.OpaqueUuidSerializer;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccountingSlipLinkControllerTest {

    @Test
    void 운영_eligibility_호출은_read_model과_한국어_차단사유를_반환한다() {
        UUID internalSourceId = UUID.randomUUID();
        AccountingSlipLinkReadModel readModel = new AccountingSlipLinkReadModel(
                "OUT-20260814-001", "OUTBOUND", "CONFIRMED", "P-001",
                BigDecimal.valueOf(110000), BigDecimal.ZERO, BigDecimal.ZERO,
                List.of(), false);
        AccountingSlipLinkReadModelService service = mock(AccountingSlipLinkReadModelService.class);
        when(service.read(internalSourceId, "OUTBOUND")).thenReturn(readModel);

        var response = new AccountingSlipLinkController(service).eligibility(
                OpaqueUuidSerializer.encode(internalSourceId), "OUTBOUND", false, "ACCOUNTANT");

        assertThat(response.getData().allowed()).isFalse();
        assertThat(response.getData().reasons()).contains("DAILY_AMOUNT_UNVERIFIED");
        assertThat(response.getData().reasonMessages())
                .contains("일마감 금액 검증이 완료되지 않았습니다");
        assertThat(response.getData().toString()).doesNotContain(internalSourceId.toString());
    }
}
