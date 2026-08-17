package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.RequirePermission;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.web.dto.SalesCommissionSettlementResponse;
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
    void exposesCalculationAlongsideExistingOperations() {
        assertThat(Arrays.stream(SalesCommissionSettlementController.class.getDeclaredMethods())
                .map(Method::getName))
                .containsExactlyInAnyOrder("list", "getOne", "create", "confirm", "calculate");
        assertThat(SalesCommissionSettlementController.PAGE_CODE)
                .isNotEqualTo("accounting.reports");
    }

    @Test
    void response_serializes_all_money_as_strings_to_preserve_16_to_18_digits() throws Exception {
        SalesCommissionSettlementResponse response = new SalesCommissionSettlementResponse(
                null, null, null, null,
                new java.math.BigDecimal("999999999999999999"),
                new java.math.BigDecimal("999999999999999998"),
                new java.math.BigDecimal("999999999999999997"),
                new java.math.BigDecimal("999999999999999996"),
                null,
                new java.math.BigDecimal("999999999999999995"),
                new java.math.BigDecimal("999999999999999994"),
                new java.math.BigDecimal("999999999999999993"),
                new java.math.BigDecimal("999999999999999992"),
                null, null,
                new java.math.BigDecimal("0.08"), new java.math.BigDecimal("0.08"),
                new java.math.BigDecimal("999999999999999991"),
                new java.math.BigDecimal("999999999999999990"),
                new java.math.BigDecimal("999999999999999989"),
                new java.math.BigDecimal("999999999999999988"),
                new java.math.BigDecimal("999999999999999987"),
                new java.math.BigDecimal("999999999999999986"),
                new java.math.BigDecimal("999999999999999985"));

        var data = new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(response));
        assertThat(data.get("totalAmount").isTextual()).isTrue();
        assertThat(data.get("totalAmount").textValue()).isEqualTo("999999999999999999");
        assertThat(data.get("payoutAmount").isTextual()).isTrue();
    }
}
