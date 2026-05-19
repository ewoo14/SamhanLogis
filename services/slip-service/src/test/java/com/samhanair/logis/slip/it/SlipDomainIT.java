package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * Slip 도메인 state machine 가드 + applyDeliveryTagAutoMemo 검증.
 *
 * <p>BE 도메인 시그니처 (PM 명시):
 * <ul>
 *   <li>{@code Slip.createOutbound(slipNo, slipDate, seqNo, sourceWarehouseId, destinationWarehouseId,
 *       partnerId, partnerName, deliveryTag, memo, requesterId)} — DRAFT 상태로 시작</li>
 *   <li>{@code Slip.createInbound(slipNo, slipDate, seqNo, destinationWarehouseId,
 *       partnerId, partnerName, deliveryTag, memo, requesterId)} — sourceWarehouseId=null</li>
 *   <li>{@code Slip.save() / send() / accept(acceptorUserId) / process() / complete()
 *       / ship() / deliver() / confirm() / reject(reason) / cancel()} — 전이 위반 시 BusinessException(CONFLICT)</li>
 *   <li>{@code Slip.applyDeliveryTagAutoMemo()} — 야적/지방 태그면 memo 에 `{slipDate}상차 {slipDate+1}하차` prepend</li>
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
                DeliveryTag.DAY, "기본 메모",
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
    void applyDeliveryTagAutoMemo_stackTag_prependsLoadingDates() {
        // 야적(STACK): memo 에 `{slipDate}상차 {slipDate+1}하차` 자동 prepend.
        LocalDate date = LocalDate.of(2026, 5, 4);
        Slip slip = Slip.createOutbound(
                "2026/05/04-3", date, 3,
                UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "거래처",
                DeliveryTag.STACK, "원본 메모",
                "user-sales-001"
        );

        slip.applyDeliveryTagAutoMemo();

        // 자동 prepend 결과 형식: "[야적] MM/dd 상차 MM/dd 하차 | 원본 메모" (yyyy 미포함, BE 의 MM/dd 포맷)
        // PR #17 1차 fail 회고 — IT 가 yyyy("2026") 가정했으나 BE 는 MM/dd 만 사용
        assertThat(slip.getMemo())
                .contains("[야적]")
                .contains("05/04")
                .contains("05/05")
                .contains("상차")
                .contains("하차")
                .contains("원본 메모");
    }

    @Test
    void applyDeliveryTagAutoMemo_dayTag_doesNotChangeMemo() {
        // 당일(DAY) 등 autoMemo=false 태그는 memo 변경 없음.
        Slip slip = newDraftOutbound();
        String original = slip.getMemo();

        slip.applyDeliveryTagAutoMemo();

        assertThat(slip.getMemo()).isEqualTo(original);
    }
}
