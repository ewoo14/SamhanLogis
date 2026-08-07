package com.samhanair.logis.slip.service.cutoff;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.cutoff.SlipOutboundCutoff;
import com.samhanair.logis.slip.repository.cutoff.SlipOutboundCutoffRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mockito;

/** 활성 출고 태그 전체의 당일 마감·익일 통과 계약을 고정한다. */
class OutboundCutoffGuardTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final LocalDate TODAY = LocalDate.of(2026, 8, 8);

    static Stream<Arguments> activeOutboundCutoffs() {
        return Stream.of(
                Arguments.of(DeliveryTag.DAY, LocalTime.of(0, 1)),
                Arguments.of(DeliveryTag.LOGEN, LocalTime.of(0, 1)),
                Arguments.of(DeliveryTag.REGION, LocalTime.NOON),
                Arguments.of(DeliveryTag.STACK, LocalTime.of(14, 0)),
                Arguments.of(DeliveryTag.GYEONGDONG_PARCEL, LocalTime.of(15, 0)),
                Arguments.of(DeliveryTag.GYEONGDONG_FREIGHT, LocalTime.of(15, 0))
        );
    }

    @ParameterizedTest(name = "{0} cutoff {1}: after cutoff blocks today but allows tomorrow")
    @MethodSource("activeOutboundCutoffs")
    void activeOutboundTag_keepsSameDayCutoffAndNextDayPass(
            DeliveryTag tag, LocalTime cutoffTime) {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        when(repository.findByDeliveryTagAndActiveTrue(tag))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(tag, cutoffTime)));
        Instant afterCutoff = TODAY.atTime(cutoffTime.plusMinutes(1)).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(Clock.fixed(afterCutoff, KST), repository);

        assertThatThrownBy(() -> guard.assertWithinCutoff(tag, TODAY))
                .isInstanceOf(BusinessException.class);
        assertThatCode(() -> guard.assertWithinCutoff(tag, TODAY.plusDays(1)))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "{0} before cutoff allows today")
    @MethodSource("activeOutboundCutoffs")
    void activeOutboundTag_keepsBeforeCutoffCreation(
            DeliveryTag tag, LocalTime cutoffTime) {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        when(repository.findByDeliveryTagAndActiveTrue(tag))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(tag, cutoffTime)));
        Instant beforeCutoff = TODAY.atTime(cutoffTime.minusMinutes(1)).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(Clock.fixed(beforeCutoff, KST), repository);

        assertThatCode(() -> guard.assertWithinCutoff(tag, TODAY))
                .doesNotThrowAnyException();
    }

    @org.junit.jupiter.api.Test
    void creationGuard_rejectsPastOutboundDate() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(TODAY.atStartOfDay(KST).toInstant(), KST), repository);

        assertThatThrownBy(() -> guard.assertWithinCutoffForCreation(
                DeliveryTag.REGION, TODAY.minusDays(1)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("과거 출고일");
    }

    @org.junit.jupiter.api.Test
    void editGuard_keepsPastExistingSlipEditable() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(TODAY.atStartOfDay(KST).toInstant(), KST), repository);

        assertThatCode(() -> guard.assertWithinCutoff(DeliveryTag.REGION, TODAY.minusDays(1)))
                .doesNotThrowAnyException();
    }
}
