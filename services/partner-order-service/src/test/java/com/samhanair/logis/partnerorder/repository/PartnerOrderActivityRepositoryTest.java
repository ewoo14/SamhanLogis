package com.samhanair.logis.partnerorder.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
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
    private PartnerOrderHistoryRepository historyRepository;

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

    @Test
    void historyPaginationUsesConfirmedEventDateAndUniqueTieBreakersWhenConfirmedAtIsNull() {
        PartnerOrder newest = orderWithoutConfirmedAt("2026/06/08-1229");
        PartnerOrder middle = orderWithoutConfirmedAt("2026/06/08-510");
        PartnerOrder oldest = orderWithoutConfirmedAt("2026/06/08-1");
        entityManager.persist(newest);
        entityManager.persist(middle);
        entityManager.persist(oldest);
        entityManager.flush();
        persistConfirmedEvent(newest, LocalDateTime.of(2026, 6, 8, 12, 29));
        persistConfirmedEvent(middle, LocalDateTime.of(2026, 6, 8, 5, 10));
        persistConfirmedEvent(oldest, LocalDateTime.of(2026, 6, 8, 0, 1));
        entityManager.flush();
        entityManager.clear();

        assertThat(historyRepository.findAllByPartnerOrderIdOrderByOccurredAtAsc(newest.getId()))
                .extracting("occurredAt")
                .containsExactly(LocalDateTime.of(2026, 6, 8, 12, 29));

        var first = repository
                .findAllHistoryIncludingDeletedByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                        "217-63-10279", LocalDateTime.of(2026, 6, 1, 0, 0),
                        LocalDateTime.of(2026, 6, 9, 0, 0),
                        org.springframework.data.domain.PageRequest.of(0, 2));
        var second = repository
                .findAllHistoryIncludingDeletedByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                        "217-63-10279", LocalDateTime.of(2026, 6, 1, 0, 0),
                        LocalDateTime.of(2026, 6, 9, 0, 0),
                        org.springframework.data.domain.PageRequest.of(1, 2));

        assertThat(first.getContent()).extracting(PartnerOrder::getOrderNo)
                .containsExactly("2026/06/08-1229", "2026/06/08-510");
        assertThat(second.getContent()).extracting(PartnerOrder::getOrderNo)
                .containsExactly("2026/06/08-1");
        assertThat(first.getContent()).extracting(PartnerOrder::getOrderNo)
                .doesNotContainAnyElementsOf(second.getContent().stream()
                        .map(PartnerOrder::getOrderNo).toList());
        assertThat(first.getTotalElements()).isEqualTo(3);
    }

    @Test
    void historyPaginationSortsVariableWidthOrderNumbersNumericallyWithinSameConfirmedEventTime() {
        LocalDateTime sameOccurredAt = LocalDateTime.of(2099, 12, 31, 23, 59);
        var orderNumbers = java.util.List.of(
                "2099/12/31-0", "2099/12/31-0007", "2099/12/31-7", "2099/12/31-9",
                "2099/12/31-25", "2099/12/31-100", "2099/12/31-1000",
                "2099/12/31-999999999999999999");
        var orders = orderNumbers.stream().map(this::orderWithoutConfirmedAt).toList();
        orders.forEach(entityManager::persist);
        entityManager.flush();
        orders.forEach(order -> persistConfirmedEvent(order, sameOccurredAt));
        entityManager.flush();
        entityManager.clear();

        var first = repository
                .findAllHistoryIncludingDeletedByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                        "217-63-10279", LocalDateTime.of(2099, 12, 31, 0, 0),
                        LocalDateTime.of(2100, 1, 1, 0, 0),
                        org.springframework.data.domain.PageRequest.of(0, 4));
        var second = repository
                .findAllHistoryIncludingDeletedByBizCodeAndConfirmedAtBetweenOrderByConfirmedAtDesc(
                        "217-63-10279", LocalDateTime.of(2099, 12, 31, 0, 0),
                        LocalDateTime.of(2100, 1, 1, 0, 0),
                        org.springframework.data.domain.PageRequest.of(1, 4));

        assertThat(first.getContent()).extracting(PartnerOrder::getOrderNo)
                .containsExactly(
                        "2099/12/31-999999999999999999",
                        "2099/12/31-1000", "2099/12/31-100", "2099/12/31-25");
        assertThat(second.getContent()).extracting(PartnerOrder::getOrderNo)
                .containsExactly("2099/12/31-9", "2099/12/31-7", "2099/12/31-0007", "2099/12/31-0");
        assertThat(first.getContent()).extracting(PartnerOrder::getOrderNo)
                .doesNotContainAnyElementsOf(second.getContent().stream()
                        .map(PartnerOrder::getOrderNo).toList());
        assertThat(first.getTotalElements()).isEqualTo(orderNumbers.size());
        assertThat(second.getTotalElements()).isEqualTo(orderNumbers.size());
    }

    private PartnerOrder orderWithoutConfirmedAt(String orderNo) {
        PartnerOrder order = PartnerOrder.create("P-2026-0009", "217-63-10279", orderNo,
                "history-order-" + orderNo, BigDecimal.ONE);
        ReflectionTestUtils.setField(order, "confirmedAt", null);
        return order;
    }

    private void persistConfirmedEvent(PartnerOrder order, LocalDateTime occurredAt) {
        PartnerOrderHistory history = PartnerOrderHistory.ofOrder(order.getId(), "P-2026-0009",
                HistoryEventType.CONFIRMED, "history-test", "{}");
        ReflectionTestUtils.setField(history, "occurredAt", occurredAt);
        historyRepository.save(history);
    }
}
