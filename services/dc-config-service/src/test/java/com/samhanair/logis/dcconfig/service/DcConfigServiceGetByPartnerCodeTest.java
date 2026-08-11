package com.samhanair.logis.dcconfig.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.audit.service.DcConfigAuditLogService;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DcConfigServiceGetByPartnerCodeTest {

    @Mock
    private DcConfigRepository dcConfigRepository;

    @Mock
    private PartnerService partnerService;

    @Mock
    private DcConfigAuditLogService dcConfigAuditLogService;

    @Test
    void getByPartnerCode_usesPartnerFetchedWithDcForResponseMappingOutsideServiceTransaction() {
        Partner partner = Partner.create("P-FETCH", "1234567890", "조회 거래처", null, null, null,
                PartnerGroup.WHOLESALE, null, null);
        DcConfig config = DcConfig.create(partner, DcConfigSource.LEGACY_CSV);
        config.changeRates(new BigDecimal("0.4800"), new BigDecimal("0.4900"));
        when(dcConfigRepository.findWithPartnerByPartnerCode("P-FETCH"))
                .thenReturn(Optional.of(config));

        DcConfig result = new DcConfigService(dcConfigRepository, partnerService, dcConfigAuditLogService)
                .getByPartnerCode("P-FETCH");

        assertThat(result).isSameAs(config);
        verify(dcConfigRepository).findWithPartnerByPartnerCode("P-FETCH");
    }
}
