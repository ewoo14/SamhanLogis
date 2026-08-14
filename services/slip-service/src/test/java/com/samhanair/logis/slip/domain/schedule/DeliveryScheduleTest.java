package com.samhanair.logis.slip.domain.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.domain.DeliveryTag;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/**
 * {@link DeliverySchedule} 배송일정 규칙 단위 테스트.
 *
 * <p>TDD 먼저: computeUnloadDate + scheduleLabel 의 모든 경계 케이스 박제.
 * estimate-app index.ejs:15264-15273 레퍼런스 1:1.
 */
class DeliveryScheduleTest {

    // ---------- computeUnloadDate ----------

    @Test
    void computeUnloadDate_지방_평일_익일() {
        // 수요일(2026-06-24) → 목요일(2026-06-25)
        LocalDate m = LocalDate.of(2026, 6, 24);
        assertThat(DeliverySchedule.computeUnloadDate(m, DeliveryTag.REGION))
                .isEqualTo(LocalDate.of(2026, 6, 25));
    }

    @Test
    void computeUnloadDate_지방_금요일_토요일() {
        // 금요일(2026-06-26) → 토요일(2026-06-27). N=토요일은 일요일 아님 → 그대로.
        LocalDate m = LocalDate.of(2026, 6, 26);
        assertThat(DeliverySchedule.computeUnloadDate(m, DeliveryTag.REGION))
                .isEqualTo(LocalDate.of(2026, 6, 27));
    }

    @Test
    void computeUnloadDate_지방_토요일_월요일() {
        // 지방 토요일(2026-06-27) → N=일요일(2026-06-28) → 일요일 skip → 월요일(2026-06-29)
        LocalDate sat = LocalDate.of(2026, 6, 27); // 토요일
        LocalDate result = DeliverySchedule.computeUnloadDate(sat, DeliveryTag.REGION);
        assertThat(result).isEqualTo(LocalDate.of(2026, 6, 29));
    }

    @Test
    void computeUnloadDate_지방_일요일_월요일() {
        // 지방 일요일(2026-06-28) → N=월요일(2026-06-29) — N이 일요일이 아니므로 그대로.
        LocalDate sun = LocalDate.of(2026, 6, 28); // 일요일
        LocalDate result = DeliverySchedule.computeUnloadDate(sun, DeliveryTag.REGION);
        // N = sun+1 = 월요일 → 일요일 아님 → 그대로
        assertThat(result).isEqualTo(LocalDate.of(2026, 6, 29));
    }

    @Test
    void computeUnloadDate_야적_토요일_일요일유지() {
        // 야적 && M=토요일 → N=일요일 그대로 유지 (예외 규칙)
        LocalDate sat = LocalDate.of(2026, 6, 27); // 토요일
        LocalDate result = DeliverySchedule.computeUnloadDate(sat, DeliveryTag.STACK);
        // N = 28(일) → 야적&&토 예외 → 일요일 유지
        assertThat(result).isEqualTo(LocalDate.of(2026, 6, 28));
    }

    @Test
    void computeUnloadDate_야적_평일_익일() {
        // 야적 수요일 → 목요일 (일반 익일)
        LocalDate m = LocalDate.of(2026, 6, 24);
        assertThat(DeliverySchedule.computeUnloadDate(m, DeliveryTag.STACK))
                .isEqualTo(LocalDate.of(2026, 6, 25));
    }

    @Test
    void computeUnloadDate_비적용태그_null() {
        // SALE 태그는 배송일정 미적용 → null
        LocalDate m = LocalDate.of(2026, 6, 24);
        assertThat(DeliverySchedule.computeUnloadDate(m, DeliveryTag.SALE)).isNull();
        assertThat(DeliverySchedule.computeUnloadDate(m, DeliveryTag.LOGEN)).isNull();
        assertThat(DeliverySchedule.computeUnloadDate(m, null)).isNull();
    }

    @Test
    void computeUnloadDate_slipDate_null_반환null() {
        assertThat(DeliverySchedule.computeUnloadDate(null, DeliveryTag.REGION)).isNull();
    }

    // ---------- scheduleLabel ----------

    @Test
    void scheduleLabel_지방_일반_라벨() {
        // 지방 06-25상차 06-26하차 → "25상26하"
        LocalDate m = LocalDate.of(2026, 6, 25);
        LocalDate n = LocalDate.of(2026, 6, 26);
        assertThat(DeliverySchedule.scheduleLabel(m, n, DeliveryTag.REGION)).isEqualTo("25상26하");
    }

    @Test
    void scheduleLabel_지방_당착() {
        // 지방 && N == M → "당착"
        LocalDate m = LocalDate.of(2026, 6, 25);
        assertThat(DeliverySchedule.scheduleLabel(m, m, DeliveryTag.REGION)).isEqualTo("당착");
    }

    @Test
    void scheduleLabel_야적_라벨() {
        // 야적 06-27상차 06-28하차 → "27상28하"
        LocalDate m = LocalDate.of(2026, 6, 27);
        LocalDate n = LocalDate.of(2026, 6, 28);
        assertThat(DeliverySchedule.scheduleLabel(m, n, DeliveryTag.STACK)).isEqualTo("27상28하");
    }

    @Test
    void scheduleLabel_월말경계() {
        // 06-30 상차 07-01 하차 → "30상1하" (leading zero 없음)
        LocalDate m = LocalDate.of(2026, 6, 30);
        LocalDate n = LocalDate.of(2026, 7, 1);
        assertThat(DeliverySchedule.scheduleLabel(m, n, DeliveryTag.REGION)).isEqualTo("30상1하");
    }

    @Test
    void scheduleLabel_비적용태그_null() {
        LocalDate m = LocalDate.of(2026, 6, 25);
        LocalDate n = LocalDate.of(2026, 6, 26);
        assertThat(DeliverySchedule.scheduleLabel(m, n, DeliveryTag.SALE)).isNull();
        assertThat(DeliverySchedule.scheduleLabel(m, n, null)).isNull();
    }

    @Test
    void scheduleLabel_unloadDate_null_반환null() {
        LocalDate m = LocalDate.of(2026, 6, 25);
        assertThat(DeliverySchedule.scheduleLabel(m, null, DeliveryTag.REGION)).isNull();
    }

    @Test
    void isScheduled_지방야적만_true() {
        assertThat(DeliverySchedule.isScheduled(DeliveryTag.REGION)).isTrue();
        assertThat(DeliverySchedule.isScheduled(DeliveryTag.STACK)).isTrue();
        assertThat(DeliverySchedule.isScheduled(DeliveryTag.SALE)).isFalse();
        assertThat(DeliverySchedule.isScheduled(DeliveryTag.LOGEN)).isFalse();
        assertThat(DeliverySchedule.isScheduled(null)).isFalse();
    }
}
