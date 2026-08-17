package com.samhanair.logis.dcconfig.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

/** 주문서웹 QA 거래처가 가격 미리보기의 dc-config 단계까지 도달하는 시드 계약. */
class QaPartnerDcConfigSeederContractTest {

    @Test
    void qa_dc_config_seeder_exists() throws Exception {
        Class<?> seeder = QaPartnerDcConfigSeeder.class;

        assertThat(seeder.getAnnotation(org.springframework.context.annotation.Profile.class)
                .value()).containsExactlyInAnyOrder("dev", "local");
        assertThat(seeder.getAnnotation(
                org.springframework.boot.autoconfigure.condition.ConditionalOnProperty.class)
                .havingValue()).isEqualTo("true");
    }

    @Test
    void creates_partner_and_dc_config_once() {
        PartnerRepository partners = Mockito.mock(PartnerRepository.class);
        DcConfigRepository configs = Mockito.mock(DcConfigRepository.class);
        when(partners.findByPartnerCode(QaPartnerDcConfigSeeder.QA_PARTNER_CODE))
                .thenReturn(Optional.empty());
        when(partners.save(Mockito.any(Partner.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(configs.findByPartner_Id(Mockito.any())).thenReturn(Optional.empty());
        when(configs.save(Mockito.any(DcConfig.class))).thenAnswer(invocation -> invocation.getArgument(0));

        new QaPartnerDcConfigSeeder(partners, configs).seed();

        ArgumentCaptor<Partner> partner = ArgumentCaptor.forClass(Partner.class);
        verify(partners).save(partner.capture());
        assertThat(partner.getValue().getPartnerCode()).isEqualTo(QaPartnerDcConfigSeeder.QA_PARTNER_CODE);
        ArgumentCaptor<DcConfig> config = ArgumentCaptor.forClass(DcConfig.class);
        verify(configs).save(config.capture());
        assertThat(config.getValue().getPartner()).isSameAs(partner.getValue());

        when(partners.findByPartnerCode(QaPartnerDcConfigSeeder.QA_PARTNER_CODE))
                .thenReturn(Optional.of(partner.getValue()));
        when(configs.findByPartner_Id(partner.getValue().getId()))
                .thenReturn(Optional.of(config.getValue()));
        new QaPartnerDcConfigSeeder(partners, configs).seed();
        verify(configs, never()).delete(Mockito.any());
    }
}
