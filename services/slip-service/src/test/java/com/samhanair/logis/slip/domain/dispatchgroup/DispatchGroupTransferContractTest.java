package com.samhanair.logis.slip.domain.dispatchgroup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class DispatchGroupTransferContractTest {
    @Test
    void only_active_arologis_carrier_group_with_slips_is_transferable() {
        DispatchGroup group = DispatchGroup.create("DG-01", LocalDate.of(2026, 8, 4), "1톤");
        assertThat(group.canTransferToArologis(true, true, true)).isTrue();
        assertThat(group.canTransferToArologis(false, true, true)).isFalse();
        assertThat(group.canTransferToArologis(true, false, true)).isFalse();
        assertThat(group.canTransferToArologis(true, true, false)).isFalse();
        group.markTransferSent();
        assertThat(group.canTransferToArologis(true, true, true)).isFalse();
    }

    @Test
    void sent_group_rejects_all_mutations_with_reason() {
        DispatchGroup group = DispatchGroup.create("DG-01", LocalDate.of(2026, 8, 4), "1톤");
        group.markTransferSent();
        assertThatThrownBy(() -> group.update(LocalDate.now(), "2톤"))
                .hasMessage("아로로지스 전송 완료 그룹은 수정할 수 없습니다.");
        assertThatThrownBy(group::clearCarrier)
                .hasMessage("아로로지스 전송 완료 그룹은 운송사를 변경할 수 없습니다.");
    }
}
