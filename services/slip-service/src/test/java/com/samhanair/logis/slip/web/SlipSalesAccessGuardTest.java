package com.samhanair.logis.slip.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.SlipStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link SlipSalesAccessGuard} 단위 테스트 — Phase C5-3 그룹 OR 판정 포함.
 */
@DisplayName("SlipSalesAccessGuard 권한 판정 테스트")
class SlipSalesAccessGuardTest {

    // -----------------------------------------------------------------------
    // 기존 role 경로 — behavior-preserving 검증
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("기존-(a) role=SALES → canReadOutboundSales true")
    void canRead_salesRole_returnsTrue() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales("SALES")).isTrue();
    }

    @Test
    @DisplayName("기존-(b) role=MANAGER → canReadOutboundSales true")
    void canRead_managerRole_returnsTrue() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales("MANAGER")).isTrue();
    }

    @Test
    @DisplayName("기존-(c) role=MASTER → canReadOutboundSales true")
    void canRead_masterRole_returnsTrue() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales("MASTER")).isTrue();
    }

    @Test
    @DisplayName("기존-(d) role=WAREHOUSE → canReadOutboundSales false")
    void canRead_warehouseRole_returnsFalse() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales("WAREHOUSE")).isFalse();
    }

    @Test
    @DisplayName("기존-(e) role=INVENTORY → canReadOutboundSales false")
    void canRead_inventoryRole_returnsFalse() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales("INVENTORY")).isFalse();
    }

    @Test
    @DisplayName("기존-(f) role=null → canReadOutboundSales false")
    void canRead_nullRole_returnsFalse() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales((String) null)).isFalse();
    }

    @Test
    @DisplayName("기존-(g) guardOutboundSalesRead — INBOUND 이면 가드 스킵")
    void guard_inboundType_skips() {
        // 예외 없이 통과
        SlipSalesAccessGuard.guardOutboundSalesRead(SlipType.INBOUND, "WAREHOUSE");
    }

    @Test
    @DisplayName("기존-(h) guardOutboundSalesRead — OUTBOUND + WAREHOUSE → 403")
    void guard_outboundWithWarehouseRole_throws() {
        assertThatThrownBy(() ->
                SlipSalesAccessGuard.guardOutboundSalesRead(SlipType.OUTBOUND, "WAREHOUSE"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("SALES / MANAGER / MASTER");
    }

    @Test
    @DisplayName("R10: 결재선 개인은 CONFIRMED 상태에서도 OUTBOUND 상세를 조회한다")
    void guard_outboundApprovalLineMember_confirmed_passes() {
        SlipSalesAccessGuard.guardOutboundSalesRead(
                SlipType.OUTBOUND, SlipStatus.CONFIRMED, null, null, null, true);
    }

    // -----------------------------------------------------------------------
    // Phase C5-3: 그룹 경로 검증
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("C5-3-(a) SALES 빌트인 그룹(102) 포함 → canReadOutboundSales true")
    void canRead_withSalesGroupId_returnsTrue() {
        String salesGroupId = "00000000-0000-0000-0000-000000000102";
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, salesGroupId, null)).isTrue();
    }

    @Test
    @DisplayName("C5-3-(b) MASTER 빌트인 그룹(100) 포함 → canReadOutboundSales true")
    void canRead_withMasterGroupId_returnsTrue() {
        String masterGroupId = "00000000-0000-0000-0000-000000000100";
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, masterGroupId, null)).isTrue();
    }

    @Test
    @DisplayName("C5-3-(c) MANAGER 빌트인 그룹(101) 포함 → canReadOutboundSales true")
    void canRead_withManagerGroupId_returnsTrue() {
        String managerGroupId = "00000000-0000-0000-0000-000000000101";
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, managerGroupId, null)).isTrue();
    }

    @Test
    @DisplayName("C5-3-(d) 허용 그룹 없음 + role null → false")
    void canRead_noGroupNoRole_returnsFalse() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, null, null)).isFalse();
    }

    @Test
    @DisplayName("C5-3-(e) WAREHOUSE 그룹(103) + role=WAREHOUSE → false (허용 그룹 아님)")
    void canRead_warehouseGroupId_returnsFalse() {
        String warehouseGroupId = "00000000-0000-0000-0000-000000000103";
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, warehouseGroupId, null)).isFalse();
    }

    @Test
    @DisplayName("C5-3-(f) X-Is-System-Master=true → 역할/그룹 무관 true")
    void canRead_isSystemMasterTrue_returnsTrue() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, null, "true")).isTrue();
    }

    @Test
    @DisplayName("C5-3-(g) X-Is-System-Master=false + 허용 그룹 없음 → false")
    void canRead_isSystemMasterFalse_noGroup_returnsFalse() {
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, null, "false")).isFalse();
    }

    @Test
    @DisplayName("C5-3-(h) 다수 그룹 중 SALES(102) 포함 → true")
    void canRead_multipleGroupsWithSalesIncluded_returnsTrue() {
        String groups = "00000000-0000-0000-0000-000000000103,00000000-0000-0000-0000-000000000102";
        assertThat(SlipSalesAccessGuard.canReadOutboundSales(null, groups, null)).isTrue();
    }

    @Test
    @DisplayName("C5-3-(i) guardOutboundSalesRead — OUTBOUND + SALES 그룹 → 통과")
    void guard_outboundWithSalesGroup_passes() {
        String salesGroupId = "00000000-0000-0000-0000-000000000102";
        SlipSalesAccessGuard.guardOutboundSalesRead(SlipType.OUTBOUND, null, salesGroupId, null);
    }

    @Test
    @DisplayName("C5-3-(j) restrictOutboundWhenTypeOmitted — SALES 그룹 있으면 null 그대로 반환")
    void restrictOutbound_withSalesGroup_returnsNullAsIs() {
        String salesGroupId = "00000000-0000-0000-0000-000000000102";
        SlipType result = SlipSalesAccessGuard.restrictOutboundWhenTypeOmitted(null, null, salesGroupId, null);
        assertThat(result).isNull();
    }

    @Test
    @DisplayName("C5-3-(k) restrictOutboundWhenTypeOmitted — 허용 조건 없으면 INBOUND 반환")
    void restrictOutbound_noPermission_returnsInbound() {
        SlipType result = SlipSalesAccessGuard.restrictOutboundWhenTypeOmitted(null, null, null, null);
        assertThat(result).isEqualTo(SlipType.INBOUND);
    }
}
