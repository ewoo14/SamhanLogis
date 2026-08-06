package com.samhanair.logis.slip.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.slip.domain.Slip;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

/** 활동 조회가 출고전표의 사업자번호(business_number)를 기준으로 동작하는지 검증한다. */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(JpaAuditingConfig.class)
class SlipActivityRepositoryTest {

    @Autowired
    private SlipRepository repository;

    @Autowired
    private org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

    @Test
    void activityLookupFindsOutboundSlipByAuthBusinessNumberWhenPartnerCodeDiffers() {
        Slip slip = Slip.createOutbound(
                "2026/08/01-1",
                LocalDate.of(2026, 8, 1),
                1,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "삼한상사",
                null,
                "활동 RED fixture",
                "tester");
        slip.setPartnerCode("P-2026-0001");
        slip.setBusinessNumber("211-87-12345");
        entityManager.persistAndFlush(slip);
        entityManager.clear();

        assertThat(repository.findLastOutboundDateByBusinessNumber("2118712345"))
                .as("[DEV-SEED/단위 fixture] auth 사업자번호로 출고 활동을 찾아야 한다")
                .isEqualTo(LocalDate.of(2026, 8, 1));
    }
}
