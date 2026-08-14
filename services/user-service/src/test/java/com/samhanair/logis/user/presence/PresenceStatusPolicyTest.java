package com.samhanair.logis.user.presence;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class PresenceStatusPolicyTest {

    @Test
    void sixStatusesRoundTripAndLabelsAreStable() {
        assertThat(PresenceStatus.values()).containsExactly(
                PresenceStatus.AVAILABLE,
                PresenceStatus.AWAY,
                PresenceStatus.ABSENT,
                PresenceStatus.IN_MEETING,
                PresenceStatus.ON_CALL,
                PresenceStatus.OFFLINE);

        assertThat(PresenceStatus.AVAILABLE.label()).isEqualTo("접속");
        assertThat(PresenceStatus.AWAY.label()).isEqualTo("자리비움");
        assertThat(PresenceStatus.ABSENT.label()).isEqualTo("부재중");
        assertThat(PresenceStatus.IN_MEETING.label()).isEqualTo("회의중");
        assertThat(PresenceStatus.ON_CALL.label()).isEqualTo("통화중");
        assertThat(PresenceStatus.OFFLINE.label()).isEqualTo("오프라인");
        for (PresenceStatus status : PresenceStatus.values()) {
            assertThat(PresenceStatus.valueOf(status.name())).isEqualTo(status);
        }
    }

    @Test
    void manualMeetingAndCallBeatAutomaticIdleTransitions() {
        Instant now = Instant.parse("2026-08-14T00:00:00Z");

        assertThat(PresenceStatusPolicy.automaticStatus(PresenceStatus.IN_MEETING,
                now.minus(Duration.ofMinutes(45)), now)).isEqualTo(PresenceStatus.IN_MEETING);
        assertThat(PresenceStatusPolicy.automaticStatus(PresenceStatus.ON_CALL,
                now.minus(Duration.ofMinutes(45)), now)).isEqualTo(PresenceStatus.ON_CALL);
        assertThat(PresenceStatusPolicy.automaticStatus(PresenceStatus.AVAILABLE,
                now.minus(Duration.ofMinutes(10)), now)).isEqualTo(PresenceStatus.AWAY);
        assertThat(PresenceStatusPolicy.automaticStatus(PresenceStatus.AWAY,
                now.minus(Duration.ofMinutes(30)), now)).isEqualTo(PresenceStatus.ABSENT);
    }

    @Test
    void directorySortsGroupThenKnownRankThenHireDateAndKeepsDeveloperOutOfRankAxis() {
        var entries = List.of(
                new MessengerDirectoryEntry("개발", "개발자", java.time.LocalDate.of(2020, 1, 1), "개발자"),
                new MessengerDirectoryEntry("개발", "사원", java.time.LocalDate.of(2024, 1, 1), "사원"),
                new MessengerDirectoryEntry("개발", "부장", java.time.LocalDate.of(2021, 1, 1), "부장"),
                new MessengerDirectoryEntry("개발", "사원", java.time.LocalDate.of(2020, 1, 1), "사원"),
                new MessengerDirectoryEntry("영업", "대리", java.time.LocalDate.of(2022, 1, 1), "대리")
        );

        assertThat(MessengerDirectorySorter.sort(entries).stream().map(MessengerDirectoryEntry::jobTitle))
                .containsExactly("부장", "사원", "사원", "개발자", "대리");
    }
}
