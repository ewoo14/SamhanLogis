package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.RequirePermission;
import java.lang.reflect.Method;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

/** S4a REST endpoint와 전용 권한 pageCode의 1:1 계약 테스트. */
class SalesCommissionSettlementControllerTest {

    private static final String PAGE_CODE = "accounting.sales-commission-settlement";

    @Test
    void everyRestOperation_usesDedicatedPermissionPageCode() {
        for (Method method : SalesCommissionSettlementController.class.getDeclaredMethods()) {
            RequirePermission permission = method.getAnnotation(RequirePermission.class);
            if (permission == null) {
                continue;
            }
            assertThat(permission.page()).isEqualTo(PAGE_CODE);
        }
    }

    @Test
    void exposesExactlyListDetailCreateAndConfirmOperations() {
        assertThat(Arrays.stream(SalesCommissionSettlementController.class.getDeclaredMethods())
                .map(Method::getName))
                .containsExactlyInAnyOrder("list", "getOne", "create", "confirm");
        assertThat(SalesCommissionSettlementController.PAGE_CODE)
                .isNotEqualTo("accounting.reports");
    }
}
