package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import java.time.LocalDate;
import java.util.Optional;
import java.util.EnumSet;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Slip 도메인 state machine 가드 검증.
 *
 * <p>BE 도메인 시그니처 (PM 명시):
 * <ul>
 *   <li>{@code Slip.createOutbound(slipNo, slipDate, seqNo, sourceWarehouseId, destinationWarehouseId,
 *       partnerId, partnerName, deliveryTag, memo, requesterId)} — DRAFT 상태로 시작</li>
 *   <li>{@code Slip.createInbound(slipNo, slipDate, seqNo, destinationWarehouseId,
 *       partnerId, partnerName, deliveryTag, memo, requesterId)} — sourceWarehouseId=null</li>
 *   <li>{@code Slip.save() / send() / accept(acceptorUserId) / process() / complete()
 *       / ship() / deliver() / confirm() / reject(reason) / cancel()} — 전이 위반 시 BusinessException(CONFLICT)</li>
 *   <li>{@code Slip.applyDeliverySchedule(tag, override)} — 지방/야적 태그면 하차일(N) 구조화 필드 계산 (V52)</li>
 * </ul>
 *
 * <p>SlipStatus (Slice A 갱신): DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING →
 * COMPLETED → SHIPPING → DELIVERED → CONFIRMED.
 * 입고는 ship/deliver 스킵 → COMPLETED → CONFIRMED.
 * REJECTED / CANCELED 는 종착 상태. INSPECTING 단계도 reject 가능.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class SlipDomainIT extends AbstractPostgresIT {

    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
    }

    private Slip newDraftOutbound() {
        return Slip.createOutbound(
                "2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "테스트 거래처",
                DeliveryTag.SALE, "기본 메모",
                "user-sales-001"
        );
    }

    private Slip newDraftInbound() {
        // 입고전표는 INBOUND direction 의 태그만 가능 (RETURN_TRIP/RETURN/BORROW).
        // DAY 는 OUTBOUND 전용이라 BE 가 IllegalArgumentException 으로 거부 (PR #17 1차 fail 회고).
        return Slip.createInbound(
                "2026/05/04-2", LocalDate.of(2026, 5, 4), 2,
                UUID.randomUUID(),
                UUID.randomUUID(), "테스트 거래처",
                DeliveryTag.RETURN_TRIP, "입고 메모",
                "user-sales-001"
        );
    }

    private Slip newDraftOutboundWithoutPartner() {
        return Slip.createOutbound(
                "2026/05/04-3", LocalDate.of(2026, 5, 4), 3,
                UUID.randomUUID(), UUID.randomUUID(),
                null, null, DeliveryTag.SALE, "거래처 없는 초안",
                "user-sales-001"
        );
    }

    private SlipSnapshot partnerlessSnapshot(Slip slip) {
        SlipSnapshot source = slip.toSnapshot();
        return new SlipSnapshot(
                source.slipNo(), source.slipDate(), null, source.partnerName(), source.partnerCode(),
                source.businessNumber(), source.memo(), source.deliveryTag(), source.deliveryAddress(),
                source.supervisionAddress(), source.projectName(), source.recipientPhone(),
                source.paymentDueDate(), source.destinationWarehouseId(), source.destinationWarehouseName(),
                source.shippingAddress(), source.inspectionAddress(), source.receiverPhone(),
                source.customerTel(), source.customerAddress(), source.customerRepresentative(),
                source.paymentDueLabel(), source.discountInfo(), source.collectTerm(), source.agreeTerm(),
                source.lines());
    }

    @Test
    void outbound_happyPath_DraftToConfirmed() {
        Slip slip = newDraftOutbound();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.DRAFT);

        slip.save();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SAVED);

        slip.send();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SENT);

        slip.accept("user-warehouse-001");
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.ACCEPTED);

        slip.process();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.PROCESSING);

        // PR #21 hotfix: complete = 출고 완료 → INSPECTING, inspect = 검수 완료 → COMPLETED.
        slip.complete();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.INSPECTING);

        slip.inspect("user-inspector-001");
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.COMPLETED);

        slip.ship();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SHIPPING);

        slip.deliver();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.DELIVERED);

        slip.confirm();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.CONFIRMED);
    }

    @Test
    void inbound_happyPath_skipsShipAndDeliver() {
        Slip slip = newDraftInbound();
        slip.save();
        slip.send();
        slip.accept("user-warehouse-001");
        slip.process();
        // PR #21 hotfix: complete = PROCESSING→INSPECTING, inspect = INSPECTING→COMPLETED.
        slip.complete();
        slip.inspect("user-inspector-001");
        // 입고는 ship/deliver 단계 스킵 — COMPLETED 에서 바로 confirm.
        slip.confirm();

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.CONFIRMED);
    }

    @Test
    void savedSlip_withoutPartner_cannotBeSent() {
        Slip slip = newDraftOutboundWithoutPartner();
        slip.save();

        assertThatThrownBy(slip::send)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT)
                .hasMessage("전표 전송 전 거래처를 지정해야 합니다");
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SAVED);
    }

    @Test
    void draftWithoutPartner_canBeSaved() {
        Slip slip = newDraftOutboundWithoutPartner();

        slip.save();

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SAVED);
    }

    @ParameterizedTest(name = "{0} 상태는 거래처 없는 이력 복원을 거부한다")
    @EnumSource(value = SlipStatus.class, names = {
            "SENT", "ACCEPTED", "PROCESSING", "INSPECTING", "COMPLETED", "SHIPPING",
            "DELIVERED", "CONFIRMED", "REJECTED"
    })
    void committedSlip_cannotRestorePartnerlessSnapshot_forEveryRequiredStatus(SlipStatus status) {
        Slip slip = newDraftOutbound();
        slip.save();
        slip.send();
        ReflectionTestUtils.setField(slip, "status", status);

        assertThatThrownBy(() -> slip.restoreFromSnapshot(partnerlessSnapshot(slip)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT)
                .hasMessage("거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다");
        assertThat(slip.getPartnerId()).isNotNull();
        assertThat(slip.getStatus()).isEqualTo(status);
    }

    @Test
    void requiredPartnerStatuses_areExactlyAllStatusesExceptDraftSavedCanceled() {
        assertThat(Slip.requiredPartnerStatuses())
                .containsExactlyInAnyOrderElementsOf(EnumSet.complementOf(
                        EnumSet.of(SlipStatus.DRAFT, SlipStatus.SAVED, SlipStatus.CANCELED)));
    }

    @ParameterizedTest(name = "{0} forward 전이는 거래처 없는 legacy 전표를 차단한다")
    @EnumSource(value = SlipStatus.class, names = {
            "SENT", "ACCEPTED", "PROCESSING", "INSPECTING", "COMPLETED", "SHIPPING",
            "DELIVERED"
    })
    void committedForwardTransition_withoutPartner_isRejected(SlipStatus status) {
        Slip slip = newDraftOutbound();
        slip.save();
        slip.send();
        ReflectionTestUtils.setField(slip, "partnerId", null);
        ReflectionTestUtils.setField(slip, "status", status);

        assertThatThrownBy(() -> invokeForwardTransition(slip, status))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT)
                .hasMessage("거래처 없는 전표는 이 전이를 수행할 수 없습니다");
        assertThat(slip.getStatus()).isEqualTo(status);
    }

    @Test
    void rejectedForwardTransition_withoutPartner_isRejected() {
        Slip slip = newDraftOutbound();
        slip.save();
        slip.send();
        ReflectionTestUtils.setField(slip, "partnerId", null);
        ReflectionTestUtils.setField(slip, "status", SlipStatus.SENT);

        assertThatThrownBy(() -> slip.reject("legacy partnerless"))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT)
                .hasMessage("거래처 없는 전표는 이 전이를 수행할 수 없습니다");
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SENT);
    }

    private void invokeForwardTransition(Slip slip, SlipStatus status) {
        switch (status) {
            case SENT -> slip.accept("acceptor");
            case ACCEPTED -> slip.process();
            case PROCESSING -> slip.complete();
            case INSPECTING -> slip.inspect("inspector");
            case COMPLETED -> slip.ship();
            case SHIPPING -> slip.deliver();
            case DELIVERED -> slip.confirm();
            default -> throw new AssertionError("지원하지 않는 forward 상태: " + status);
        }
    }

    @Test
    void draftSlip_canRestorePartnerlessSnapshot() {
        Slip slip = newDraftOutboundWithoutPartner();

        slip.restoreFromSnapshot(partnerlessSnapshot(slip));

        assertThat(slip.getPartnerId()).isNull();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.DRAFT);
    }

    @Test
    void committedSlip_canRestoreSnapshotWithPartner() {
        Slip slip = newDraftOutbound();
        slip.save();
        slip.send();

        slip.restoreFromSnapshot(slip.toSnapshot());

        assertThat(slip.getPartnerId()).isNotNull();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SENT);
    }

    @Test
    void invalidTransition_acceptFromDraft_throwsConflict() {
        Slip slip = newDraftOutbound();
        // DRAFT 에서 accept 시도 → SENT 가 아니므로 CONFLICT.
        assertThatThrownBy(() -> slip.accept("user-warehouse-001"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void invalidTransition_cancelFromAccepted_throwsConflict() {
        Slip slip = newDraftOutbound();
        slip.save();
        slip.send();
        slip.accept("user-warehouse-001");
        // ACCEPTED 단계 이후 cancel 은 reject 경로로만 가능 (reject_after_accept → release).
        assertThatThrownBy(slip::cancel)
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void invalidTransition_rejectFromCompleted_throwsConflict() {
        Slip slip = newDraftOutbound();
        slip.save();
        slip.send();
        slip.accept("user-warehouse-001");
        slip.process();
        // PR #21 hotfix: complete first then inspect.
        slip.complete();
        slip.inspect("user-inspector-001");
        // COMPLETED 이후 reject 시도 → CONFLICT.
        assertThatThrownBy(() -> slip.reject("이미 완료된 전표를 거부 시도"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void canceledSlip_anyTransition_throwsConflict() {
        Slip slip = newDraftOutbound();
        slip.cancel();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.CANCELED);

        // CANCELED 에서 어떤 전이도 차단.
        assertThatThrownBy(slip::save).isInstanceOf(BusinessException.class);
        assertThatThrownBy(slip::send).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> slip.accept("u1")).isInstanceOf(BusinessException.class);
    }

    @Test
    void applyDeliverySchedule_야적_평일_하차일_익일() {
        // 야적(STACK) 평일: 하차일 N = M + 1일 (구조화 필드, V52).
        LocalDate date = LocalDate.of(2027, 3, 10); // 수요일
        Slip slip = Slip.createOutbound(
                "2027/03/10-1", date, 1,
                UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "거래처",
                DeliveryTag.STACK, "원본 메모",
                "user-sales-001"
        );

        slip.applyDeliverySchedule(DeliveryTag.STACK, null);

        // N = 익일(목요일 = 2027-03-11)
        assertThat(slip.getUnloadDate()).isEqualTo(date.plusDays(1));
        // memo 는 변경 없음 (applyDeliverySchedule 은 memo 와 무관)
        assertThat(slip.getMemo()).isEqualTo("원본 메모");
    }

    @Test
    void applyDeliverySchedule_비적용태그_unloadDate_null() {
        // DAY 등 비적용 태그: unloadDate = null (데이터 오염 방지, Fix 1).
        LocalDate date = LocalDate.of(2027, 3, 10);
        Slip slip = Slip.createOutbound(
                "2027/03/10-2", date, 2,
                UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "거래처",
                DeliveryTag.SALE, null,
                "user-sales-001"
        );

        slip.applyDeliverySchedule(DeliveryTag.SALE, LocalDate.of(2027, 3, 11));
        // override != null 이어도 비적용 태그면 null 처리
        assertThat(slip.getUnloadDate()).isNull();
    }
}
