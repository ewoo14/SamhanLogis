package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateDailyClosingRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** DailyClosingService scope 이중 가드의 두 불일치 분기를 직접 고정한다. */
@ExtendWith(MockitoExtension.class)
class DailyClosingServiceScopeValidationTest {

    @Mock
    private DailyClosingRepository dailyClosingRepository;

    @Mock
    private TaxInvoiceRepository taxInvoiceRepository;

    @Mock
    private SalesAccountingSlipRepository salesAccountingSlipRepository;

    @Mock
    private PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;

    @Mock
    private PartnerLookupClient partnerLookupClient;

    @Mock
    private DynamicPermissionClient dynamicPermissionClient;

    @InjectMocks
    private DailyClosingService dailyClosingService;

    @Test
    @DisplayName("서비스 이중 가드 — ALL에 거래처가 있으면 외부 조회 전에 차단")
    void allWithPartner_rejectedBeforePartnerLookup() {
        CreateDailyClosingRequest request = new CreateDailyClosingRequest(
                LocalDate.of(2026, 7, 21), "P-001", "ALL", null, null);

        assertThatThrownBy(() -> dailyClosingService.close(request, "actor-user", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("scopeMode");
        verify(partnerLookupClient, never()).findByPartnerCode("P-001");
        verify(dailyClosingRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("서비스 이중 가드 — SELECTED에 거래처가 없으면 외부 조회 전에 차단")
    void selectedWithoutPartner_rejectedBeforePartnerLookup() {
        CreateDailyClosingRequest request = new CreateDailyClosingRequest(
                LocalDate.of(2026, 7, 21), null, "SELECTED", null, null);

        assertThatThrownBy(() -> dailyClosingService.close(request, "actor-user", null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("scopeMode");
        verify(partnerLookupClient, never()).findByPartnerCode(org.mockito.ArgumentMatchers.anyString());
        verify(dailyClosingRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
