package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.notification.dto.DispatchMessageGroupInput;
import java.util.List;
import org.junit.jupiter.api.Test;

class DispatchMessageGroupComposerTest {

    private final DispatchMessageGroupComposer composer = new DispatchMessageGroupComposer();

    @Test
    void compose_groupsByChatRoomThenBuildsUnloadDaySections() {
        List<DispatchMessageGroupInput> inputs = List.of(
                new DispatchMessageGroupInput(
                        "P-001#OUT-1", "서울 발주방", null, 6, "010-1111-2222 / 서울 강남구", null),
                new DispatchMessageGroupInput(
                        "P-002#OUT-2", "서울 발주방", null, 5, "010-3333-4444 / 경기 성남시", null));

        var messages = composer.compose(inputs);

        assertThat(messages.get("P-001#OUT-1")).isEqualTo(messages.get("P-002#OUT-2"));
        assertThat(messages.get("P-001#OUT-1"))
                .startsWith("AI 삼성무풍 시스템에어컨 배차실입니다.\n\n")
                .contains("5일 하차 건 배송기사님 연락처를 안내드립니다.\n010-3333-4444 / 경기 성남시")
                .contains("6일 하차 건 배송기사님 연락처를 안내드립니다.\n010-1111-2222 / 서울 강남구")
                .doesNotContain("[배차안내]");
    }

    @Test
    void compose_groupsUnmappedRowsByRecipientPhoneAndAddsDelayNotice() {
        List<DispatchMessageGroupInput> inputs = List.of(
                new DispatchMessageGroupInput(
                        "P-101#OUT-1", null, "010-5555-6666", 3, "010-1000-0000 / 서울", null),
                new DispatchMessageGroupInput(
                        "P-102#OUT-2", null, "010-5555-6666", 3, "010-2000-0000 / 경기", null));

        var messages = composer.compose(inputs);

        assertThat(messages.get("P-101#OUT-1")).isEqualTo(messages.get("P-102#OUT-2"));
        assertThat(messages.get("P-101#OUT-1"))
                .contains("3일 하차 건 배송기사님 연락처를 안내드립니다.")
                .contains("010-1000-0000 / 서울")
                .contains("010-2000-0000 / 경기")
                .contains("※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.");
    }

    @Test
    void compose_keepsLegacyErrorRowsAsStandaloneMessage() {
        List<DispatchMessageGroupInput> inputs = List.of(
                new DispatchMessageGroupInput(
                        "P-404#OUT-404", "서울 발주방", null, null, null, "기사번호 없음 확인요망!"));

        assertThat(composer.compose(inputs).get("P-404#OUT-404"))
                .isEqualTo("기사번호 없음 확인요망!");
    }
}
