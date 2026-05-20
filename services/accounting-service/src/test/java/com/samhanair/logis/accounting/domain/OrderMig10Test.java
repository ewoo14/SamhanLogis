package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderMig10Test {

    @Test
    void linkManagerEmployee_sets_manager_employee_id() {
        Order order = Order.fromMig8Staging("2026-05-20-001", UUID.randomUUID(), "거래처",
                "김담당", null, null, null, OrderProgressStatus.IN_PROGRESS, "HASH-1");
        UUID employeeId = UUID.randomUUID();

        order.linkManagerEmployee(employeeId);

        assertThat(order.getManagerEmployeeId()).isEqualTo(employeeId);
    }
}
