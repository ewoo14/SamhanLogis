package com.samhanair.logis.inventory.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.PostMapping;

/** QR 스캔 mutation이 계정별 동적 page-code 권한을 사용하는지 고정한다. */
class StockInstanceScanPermissionTest {

    @Test
    void inboundAndOutboundUseInventoryStockBalancePermissions() throws Exception {
        var inbound = java.util.Arrays.stream(StockInstanceController.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("scanInbound")).findFirst().orElseThrow();
        var outbound = java.util.Arrays.stream(StockInstanceController.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("scanOutbound")).findFirst().orElseThrow();
        assertThat(inbound.getAnnotation(PostMapping.class).value()).containsExactly("/scan/inbound");
        assertThat(outbound.getAnnotation(PostMapping.class).value()).containsExactly("/scan/outbound");
        assertThat(inbound.getAnnotation(RequirePermission.class).action()).isEqualTo(PermissionAction.CREATE);
        assertThat(outbound.getAnnotation(RequirePermission.class).action()).isEqualTo(PermissionAction.UPDATE);
        assertThat(inbound.getAnnotation(RequirePermission.class).page()).isEqualTo("inventory.stock-balance");
        assertThat(outbound.getAnnotation(RequirePermission.class).page()).isEqualTo("inventory.stock-balance");
    }
}
