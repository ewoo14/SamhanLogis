package com.samhanair.logis.partner.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.repository.PartnerRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;

class QaPartnerMasterSeederTest {

    @Test
    void is_guarded_to_dev_and_local_with_explicit_toggle() {
        assertThat(QaPartnerMasterSeeder.class.getAnnotation(Profile.class).value())
                .containsExactlyInAnyOrder("dev", "local");
        ConditionalOnProperty condition = QaPartnerMasterSeeder.class
                .getAnnotation(ConditionalOnProperty.class);
        assertThat(condition.value()).containsExactly("app.qa.partner.seed");
        assertThat(condition.havingValue()).isEqualTo("true");
    }

    @Test
    void creates_active_qa_master_without_business_activity() {
        PartnerRepository repository = Mockito.mock(PartnerRepository.class);
        when(repository.existsByPartnerCode(QaPartnerMasterSeeder.QA_PARTNER_CODE)).thenReturn(false);
        QaPartnerMasterSeeder seeder = new QaPartnerMasterSeeder(repository);

        seeder.seed();

        ArgumentCaptor<Partner> captor = ArgumentCaptor.forClass(Partner.class);
        verify(repository).save(captor.capture());
        Partner saved = captor.getValue();
        assertThat(saved.getPartnerCode()).isEqualTo(QaPartnerMasterSeeder.QA_PARTNER_CODE);
        assertThat(saved.getBizNo()).isEqualTo(QaPartnerMasterSeeder.QA_BIZ_NO);
        assertThat(saved.getName()).contains("QA");
        assertThat(saved.getName()).contains("주문서");
        assertThat(saved.getStatus()).isEqualTo(PartnerStatus.ACTIVE);
        assertThat(saved.getOutstandingBalance()).isZero();
    }

    @Test
    void existing_master_is_not_modified() {
        PartnerRepository repository = Mockito.mock(PartnerRepository.class);
        when(repository.existsByPartnerCode(QaPartnerMasterSeeder.QA_PARTNER_CODE)).thenReturn(true);
        new QaPartnerMasterSeeder(repository).seed();

        verify(repository, never()).save(Mockito.any());
    }
}
