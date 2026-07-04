package com.samhanair.logis.accounting.domain.codef;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** CODEF 등록기관 도메인 테스트. */
class CodefRegisteredInstitutionTest {

    @Test
    @DisplayName("비활성 재등록은 과거 검증 시각을 초기화한다")
    void reregister_clearsLastVerifiedAtWhenStatusIsNotActive() {
        CodefRegisteredInstitution institution = CodefRegisteredInstitution.create(
                CodefConnection.create("conn-verified", CodefConnectionStatus.ACTIVE),
                CodefBusinessType.BANK,
                "0004",
                null,
                null,
                CodefInstitutionStatus.ACTIVE);
        assertThat(institution.getLastVerifiedAt()).isNotNull();

        institution.reregister(CodefInstitutionStatus.ERROR);

        assertThat(institution.getLastVerifiedAt()).isNull();
    }
}
