package com.samhanair.logis.partnerauth.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

class QaPartnerAuthSeederTest {

    @Test
    void is_guarded_to_dev_and_local_with_explicit_toggle() {
        assertThat(QaPartnerAuthSeeder.class.getAnnotation(Profile.class).value())
                .containsExactlyInAnyOrder("dev", "local");
        ConditionalOnProperty condition = QaPartnerAuthSeeder.class
                .getAnnotation(ConditionalOnProperty.class);
        assertThat(condition.value()).containsExactly("app.qa.partner.seed");
        assertThat(condition.havingValue()).isEqualTo("true");
    }

    @Test
    void missing_password_fails_before_writing() {
        PartnerAuthRepository repository = Mockito.mock(PartnerAuthRepository.class);
        PasswordEncoder encoder = Mockito.mock(PasswordEncoder.class);
        QaPartnerAuthSeeder seeder = new QaPartnerAuthSeeder(repository, encoder, " ");

        assertThatThrownBy(seeder::seed)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("QA_PARTNER_ORDER_PASSWORD");
        verify(repository, never()).save(Mockito.any());
    }

    @Test
    void creates_login_ready_account_with_encoded_password() {
        PartnerAuthRepository repository = Mockito.mock(PartnerAuthRepository.class);
        PasswordEncoder encoder = Mockito.mock(PasswordEncoder.class);
        String configuredPassword = UUID.randomUUID().toString();
        when(repository.existsByBizNo(QaPartnerAuthSeeder.QA_BIZ_NO)).thenReturn(false);
        when(encoder.encode(configuredPassword)).thenReturn("encoded-value");
        QaPartnerAuthSeeder seeder = new QaPartnerAuthSeeder(repository, encoder, configuredPassword);

        seeder.seed();

        ArgumentCaptor<PartnerAuth> captor = ArgumentCaptor.forClass(PartnerAuth.class);
        verify(repository).save(captor.capture());
        PartnerAuth saved = captor.getValue();
        assertThat(saved.getBizNo()).isEqualTo(QaPartnerAuthSeeder.QA_BIZ_NO);
        assertThat(saved.getPartnerCode()).isEqualTo(QaPartnerAuthSeeder.QA_PARTNER_CODE);
        assertThat(saved.getPasswordHash()).isEqualTo("encoded-value");
        assertThat(saved.getStatus()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
    }

    @Test
    void existing_account_is_not_modified() {
        PartnerAuthRepository repository = Mockito.mock(PartnerAuthRepository.class);
        PasswordEncoder encoder = Mockito.mock(PasswordEncoder.class);
        when(repository.existsByBizNo(QaPartnerAuthSeeder.QA_BIZ_NO)).thenReturn(true);
        QaPartnerAuthSeeder seeder = new QaPartnerAuthSeeder(repository, encoder, UUID.randomUUID().toString());

        seeder.seed();

        verify(repository, never()).save(Mockito.any());
        verify(encoder, never()).encode(anyString());
    }
}
