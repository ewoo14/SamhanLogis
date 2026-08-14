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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

class AccountingSlipLinkControllerTest {

    private static final String MASTER_GROUP = "00000000-0000-0000-0000-000000000100";
    private static final String SALES_GROUP = "00000000-0000-0000-0000-000000000102";

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
                OpaqueUuidSerializer.encode(internalSourceId), "OUTBOUND", false, null);

        assertThat(response.getData().allowed()).isFalse();
        assertThat(response.getData().reasons()).contains("DAILY_AMOUNT_UNVERIFIED");
        assertThat(response.getData().reasonMessages())
                .contains("일마감 금액 검증이 완료되지 않았습니다");
        assertThat(response.getData().toString()).doesNotContain(internalSourceId.toString());
    }

    @Test
    void gateway가_검증한_MASTER_그룹으로_역할_헤더_없이_허용한다() {
        try {
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(
                            "master-user", null,
                            java.util.List.of(new SimpleGrantedAuthority("GROUP_" + MASTER_GROUP))));
            AccountingSlipLinkReadModelService service = mock(AccountingSlipLinkReadModelService.class);
            UUID sourceId = UUID.randomUUID();
            when(service.read(sourceId, "OUTBOUND")).thenReturn(confirmedReadModel());

            var response = new AccountingSlipLinkController(service).eligibility(
                    OpaqueUuidSerializer.encode(sourceId), "OUTBOUND", true,
                    SecurityContextHolder.getContext().getAuthentication());

            assertThat(response.getData().allowed()).isTrue();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    void gateway가_검증한_SALES_그룹은_역할_헤더를_조작해도_거부한다() {
        try {
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(
                            "sales-user", null,
                            java.util.List.of(new SimpleGrantedAuthority("GROUP_" + SALES_GROUP))));
            AccountingSlipLinkReadModelService service = mock(AccountingSlipLinkReadModelService.class);
            UUID sourceId = UUID.randomUUID();
            when(service.read(sourceId, "OUTBOUND")).thenReturn(confirmedReadModel());

            var response = new AccountingSlipLinkController(service).eligibility(
                    OpaqueUuidSerializer.encode(sourceId), "OUTBOUND", true,
                    SecurityContextHolder.getContext().getAuthentication());

            assertThat(response.getData().allowed()).isFalse();
            assertThat(response.getData().reasons()).contains("PERMISSION_DENIED");
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static AccountingSlipLinkReadModel confirmedReadModel() {
        return new AccountingSlipLinkReadModel(
                "OUT-20260814-001", "OUTBOUND", "CONFIRMED", "P-001",
                BigDecimal.valueOf(110000), BigDecimal.ZERO, BigDecimal.ZERO,
                List.of(), false);
    }
}
