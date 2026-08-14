package com.samhanair.logis.slip.service.cutoff;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.cutoff.SlipOutboundCutoff;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.service.closing.SlipClosingBaselineRepository;
import com.samhanair.logis.slip.service.closing.SlipClosingDateRuleRepository;
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
                Arguments.of(DeliveryTag.SALE, LocalTime.of(0, 1)),
                Arguments.of(DeliveryTag.LOGEN, LocalTime.of(0, 1)),
                Arguments.of(DeliveryTag.REGION, LocalTime.NOON),
                Arguments.of(DeliveryTag.STACK, LocalTime.of(14, 0)),
                Arguments.of(DeliveryTag.GYEONGDONG_PARCEL, LocalTime.of(15, 0)),
                Arguments.of(DeliveryTag.GYEONGDONG_FREIGHT, LocalTime.of(15, 0)),
                Arguments.of(DeliveryTag.BORROW_RETURN, LocalTime.of(16, 0))
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
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(tag.getKoreanLabel());
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
    void threeArgumentGuard_beforeCutoff_allowsToday() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        SlipClosedDateGuard closedDateGuard = Mockito.mock(SlipClosedDateGuard.class);
        when(repository.findByDeliveryTagAndActiveTrue(DeliveryTag.REGION))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(DeliveryTag.REGION, LocalTime.NOON)));
        Instant beforeCutoff = TODAY.atTime(11, 0).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(beforeCutoff, KST), repository, closedDateGuard);

        assertThatCode(() -> guard.assertWithinCutoff(
                DeliveryTag.REGION, TODAY, SlipType.OUTBOUND, "requester"))
                .doesNotThrowAnyException();
    }

    @org.junit.jupiter.api.Test
    void threeArgumentGuard_nullClosedDateGuard_afterCutoff_stillBlocksToday() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        when(repository.findByDeliveryTagAndActiveTrue(DeliveryTag.REGION))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(DeliveryTag.REGION, LocalTime.NOON)));
        Instant afterCutoff = TODAY.atTime(13, 0).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(afterCutoff, KST), repository, null);

        assertThatThrownBy(() -> guard.assertWithinCutoff(
                DeliveryTag.REGION, TODAY, SlipType.OUTBOUND, "requester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("당일 마감");
    }

    @org.junit.jupiter.api.Test
    void cutoffFailure_keepsLegacyNextDayMessageWhenNextDayPassesBothGates() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        SlipClosedDateGuard closedDateGuard = Mockito.mock(SlipClosedDateGuard.class);
        when(repository.findByDeliveryTagAndActiveTrue(DeliveryTag.REGION))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(DeliveryTag.REGION, LocalTime.NOON)));
        when(closedDateGuard.isCreatable(SlipType.OUTBOUND, TODAY.plusDays(1), "requester"))
                .thenReturn(true);
        Instant afterCutoff = TODAY.atTime(13, 0).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(afterCutoff, KST), repository, closedDateGuard);

        assertThatThrownBy(() -> guard.assertWithinCutoff(
                DeliveryTag.REGION, TODAY, SlipType.OUTBOUND, "requester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("익일 출고로 생성하세요");
    }

    @org.junit.jupiter.api.Test
    void cutoffFailure_doesNotOfferNextDayWhenNextDaysAreClosed() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        SlipClosedDateGuard closedDateGuard = Mockito.mock(SlipClosedDateGuard.class);
        when(repository.findByDeliveryTagAndActiveTrue(DeliveryTag.REGION))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(DeliveryTag.REGION, LocalTime.NOON)));
        when(closedDateGuard.isCreatable(
                SlipType.OUTBOUND, TODAY.plusDays(1), "requester")).thenReturn(false);
        when(closedDateGuard.isCreatable(
                SlipType.OUTBOUND, TODAY.plusDays(2), "requester")).thenReturn(false);
        Instant afterCutoff = TODAY.atTime(13, 0).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(afterCutoff, KST), repository, closedDateGuard);

        assertThatThrownBy(() -> guard.assertWithinCutoff(
                DeliveryTag.REGION, TODAY, SlipType.OUTBOUND, "requester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageNotContaining("익일 출고로 생성하세요");
    }

    @org.junit.jupiter.api.Test
    void cutoffFailure_namesFirstLaterDateWhenTomorrowIsClosed() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        SlipClosedDateGuard closedDateGuard = Mockito.mock(SlipClosedDateGuard.class);
        when(repository.findByDeliveryTagAndActiveTrue(DeliveryTag.REGION))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(DeliveryTag.REGION, LocalTime.NOON)));
        when(closedDateGuard.isCreatable(
                SlipType.OUTBOUND, TODAY.plusDays(1), "requester")).thenReturn(false);
        when(closedDateGuard.isCreatable(
                SlipType.OUTBOUND, TODAY.plusDays(2), "requester")).thenReturn(true);
        Instant afterCutoff = TODAY.atTime(13, 0).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(afterCutoff, KST), repository, closedDateGuard);

        assertThatThrownBy(() -> guard.assertWithinCutoff(
                DeliveryTag.REGION, TODAY, SlipType.OUTBOUND, "requester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(TODAY.plusDays(2).toString())
                .hasMessageNotContaining("익일 출고로 생성하세요");
    }

    @org.junit.jupiter.api.Test
    void noClosingBaseline_keepsLegacyNextDayMessage() {
        SlipOutboundCutoffRepository repository = Mockito.mock(SlipOutboundCutoffRepository.class);
        SlipClosingBaselineRepository baselineRepository = Mockito.mock(SlipClosingBaselineRepository.class);
        SlipClosingDateRuleRepository dateRuleRepository = Mockito.mock(SlipClosingDateRuleRepository.class);
        DynamicPermissionClient permissionClient = Mockito.mock(DynamicPermissionClient.class);
        when(repository.findByDeliveryTagAndActiveTrue(DeliveryTag.REGION))
                .thenReturn(Optional.of(SlipOutboundCutoff.create(DeliveryTag.REGION, LocalTime.NOON)));
        when(baselineRepository.findBySlipTypeAndIsDeletedFalse(SlipType.OUTBOUND))
                .thenReturn(Optional.empty());
        when(dateRuleRepository.findBySlipTypeAndClosingDateAndIsDeletedFalse(
                SlipType.OUTBOUND, TODAY.plusDays(1))).thenReturn(Optional.empty());
        SlipClosedDateGuard closedDateGuard = new SlipClosedDateGuard(
                baselineRepository, dateRuleRepository, permissionClient, Clock.fixed(
                        TODAY.atStartOfDay(KST).toInstant(), KST));
        Instant afterCutoff = TODAY.atTime(13, 0).atZone(KST).toInstant();
        OutboundCutoffGuard guard = new OutboundCutoffGuard(
                Clock.fixed(afterCutoff, KST), repository, closedDateGuard);

        assertThatThrownBy(() -> guard.assertWithinCutoff(
                DeliveryTag.REGION, TODAY, SlipType.OUTBOUND, "requester"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("익일 출고로 생성하세요");
    }
}
