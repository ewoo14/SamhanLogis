package com.samhanair.logis.partnerorder.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

/** 활동 조회가 주문의 사업자번호(biz_code)를 기준으로 동작하는지 검증한다. */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(JpaAuditingConfig.class)
class PartnerOrderActivityRepositoryTest {

    @Autowired
    private PartnerOrderRepository repository;

    @Autowired
    private org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

    @Test
    void activityLookupFindsConfirmedOrderByAuthBusinessNumberWhenPartnerCodeDiffers() {
        PartnerOrder order = PartnerOrder.create(
                "P-2026-0001",
                "211-87-12345",
                "2026/08/01-1",
                "activity-red-test",
                BigDecimal.ONE);
        ReflectionTestUtils.setField(order, "confirmedAt", LocalDateTime.of(2026, 8, 1, 10, 0));
        entityManager.persistAndFlush(order);
        entityManager.clear();

        assertThat(repository.findLastConfirmedAtByBizCode("2118712345"))
                .as("[DEV-SEED/단위 fixture] auth 사업자번호로 주문 활동을 찾아야 한다")
                .isEqualTo(LocalDateTime.of(2026, 8, 1, 10, 0));
    }
}
