package com.samhanair.logis.partner.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.repository.PartnerCreditHistoryRepository;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PartnerCreditServiceTest {

    @Test
    @DisplayName("신용한도 가드는 PartnerStatus displayName만 사용자 메시지에 노출한다")
    void recordSlipIssued_inactivePartner_usesDisplayNameInMessage() {
        PartnerService partnerService = mock(PartnerService.class);
        PartnerCreditHistoryRepository historyRepository = mock(PartnerCreditHistoryRepository.class);
        CollectionRealtimePublisher publisher = mock(CollectionRealtimePublisher.class);
        PartnerCreditService service = new PartnerCreditService(partnerService, historyRepository, publisher);

        Partner partner = Partner.register("P-1", "1234567890", "테스트", null, null, BigDecimal.TEN);
        partner.suspend();
        when(partnerService.findByCode("P-1")).thenReturn(partner);

        assertThatThrownBy(() -> service.recordSlipIssued("P-1", BigDecimal.ONE, "2026/07/11-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("거래중지")
                .hasMessageNotContaining("SUSPENDED");
    }

    @Test
    @DisplayName("PartnerStatus displayName은 데스크톱 라벨맵과 동일하다")
    void partnerStatusDisplayNames() {
        assertThat(PartnerStatus.ACTIVE.getDisplayName()).isEqualTo("거래중");
        assertThat(PartnerStatus.SUSPENDED.getDisplayName()).isEqualTo("거래중지");
        assertThat(PartnerStatus.TERMINATED.getDisplayName()).isEqualTo("거래종료");
    }
}
