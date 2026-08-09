package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestType;
import com.samhanair.logis.slip.editrequest.domain.SlipEditTargetRole;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * PR-H3 BE — SlipService 잠금 정책 가드 단위 테스트 (7 case, fix 후 CONFIRMED 추가).
 *
 * <p>{@code applyOverlayPatch} + {@code softDelete} 진입점에서 {@code guardLockPolicy} 가
 * status 별로 정확히 분기하는지 검증.
 *
 * <ol>
 *   <li>DRAFT — 자유 (mutation 진행, APPROVED 소진 없음)</li>
 *   <li>SAVED — 자유</li>
 *   <li>ACCEPTED + APPROVED 부재 — CONFLICT</li>
 *   <li>ACCEPTED + APPROVED 1건 — mutation 진행 + consumeApproval 호출</li>
 *   <li>CONFIRMED + APPROVED 부재 — CONFLICT (FE banner 정합, LOCKED_REQUIRES_APPROVAL)</li>
 *   <li>INSPECTING — CONFLICT (완전 잠금, APPROVED 무시)</li>
 *   <li>DELIVERED — CONFLICT (완전 잠금)</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class SlipServiceLockGuardTest {

    @Mock private SlipRepository slipRepository;
    @Mock private SlipNumberService slipNumberService;
    @Mock private ProductClient productClient;
    @Mock private InventoryClient inventoryClient;
    @Mock private SlipAuditLogService auditLogService;
    @Mock private SlipEditRequestService editRequestService;
    /** 권한 재편 Phase 2.1 Task 2 — overlay patch 성공 시 capture 호출. mock 격리. */
    @Mock private com.samhanair.logis.slip.revision.service.SlipRevisionService slipRevisionService;
    /** #809 가격기억 — 단위 테스트 격리. */
    @Mock private com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService priceMemoryService;
    @Mock private com.samhanair.logis.slip.service.closing.SlipClosedDateGuard closedDateGuard;

    @InjectMocks private SlipService slipService;

    private UUID slipId;
    private UUID callerId;
    private Slip slip;

    @BeforeEach
    void setUp() {
        slipId = UUID.randomUUID();
        callerId = UUID.randomUUID();
        slip = Slip.createOutbound("2026/05/10-001", LocalDate.now(), 1,
                UUID.randomUUID(), null, UUID.randomUUID(), "거래처A",
                null, "원본", "user-1");
        ReflectionTestUtils.setField(slip, "id", slipId);
        // auditLogService stub — applyOverlayPatch 후 호출
        lenient().when(auditLogService.recordOverlayPatch(any(), any(), anyString(), any(),
                anyString(), any(), any())).thenReturn(null);
    }

    @Test
    void applyOverlayPatch_draftStage_proceedsWithoutApproval() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        // slip.status = DRAFT (default)

        slipService.applyOverlayPatch(slipId, "memo", "신규 메모", callerId.toString(), "홍길동");

        assertThat(slip.getMemo()).isEqualTo("신규 메모");
        verify(editRequestService, never()).findActiveApproval(any());
        verify(editRequestService, never()).consumeApproval(any(), any());
    }

    @Test
    void applyOverlayPatch_savedStage_proceedsWithoutApproval() {
        slip.save(); // DRAFT → SAVED
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        slipService.applyOverlayPatch(slipId, "memo", "SAVED 단계 메모", callerId.toString(), null);

        assertThat(slip.getMemo()).isEqualTo("SAVED 단계 메모");
        verify(editRequestService, never()).findActiveApproval(any());
    }

    @Test
    void applyOverlayPatch_acceptedStage_withoutApproval_throwsConflict() {
        slip.save();
        slip.send();
        slip.accept(callerId.toString()); // → ACCEPTED
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(editRequestService.findActiveApproval(slipId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> slipService.applyOverlayPatch(slipId, "memo", "수정 시도",
                callerId.toString(), "홍길동"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(editRequestService, times(1)).findActiveApproval(slipId);
        verify(editRequestService, never()).consumeApproval(any(), any());
    }

    @Test
    void applyOverlayPatch_acceptedStage_withApproval_proceedsAndConsumes() {
        slip.save();
        slip.send();
        slip.accept(callerId.toString());
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        UUID requestId = UUID.randomUUID();
        SlipEditRequest approval = SlipEditRequest.create(slipId, callerId, "홍길동",
                SlipEditRequestType.EDIT, "사유", SlipEditTargetRole.WAREHOUSE, null);
        ReflectionTestUtils.setField(approval, "id", requestId);
        approval.approve(UUID.randomUUID(), "창고직원-A", null);
        when(editRequestService.findActiveApproval(slipId)).thenReturn(Optional.of(approval));

        slipService.applyOverlayPatch(slipId, "memo", "승인 후 수정", callerId.toString(), "홍길동");

        assertThat(slip.getMemo()).isEqualTo("승인 후 수정");
        verify(editRequestService, times(1))
                .consumeApproval(eq(requestId), eq(callerId.toString()));
    }

    @Test
    void applyOverlayPatch_confirmedStage_withoutApproval_throwsConflict() {
        // QA Major fix 회귀 가드 — CONFIRMED 는 LOCKED_REQUIRES_APPROVAL set (FE banner 정합).
        // FULLY_LOCKED 가 아니므로 findActiveApproval 조회를 시도하고, 부재 시 CONFLICT.
        slip.save();
        slip.send();
        slip.accept(callerId.toString());
        slip.process();
        slip.complete(); // → INSPECTING
        slip.inspect(callerId.toString()); // → COMPLETED
        slip.ship(); // → SHIPPING
        slip.deliver(); // → DELIVERED
        slip.confirm(); // → CONFIRMED
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(editRequestService.findActiveApproval(slipId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> slipService.applyOverlayPatch(slipId, "memo", "확정 후 시도",
                callerId.toString(), "홍길동"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        // CONFIRMED 는 FULLY_LOCKED 가 아니므로 APPROVED lookup 은 수행되어야 함
        verify(editRequestService, times(1)).findActiveApproval(slipId);
        verify(editRequestService, never()).consumeApproval(any(), any());
    }

    @Test
    void applyOverlayPatch_inspectingStage_alwaysFullyLocked_throwsConflict() {
        slip.save();
        slip.send();
        slip.accept(callerId.toString());
        slip.process();
        slip.complete(); // PROCESSING → INSPECTING
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> slipService.applyOverlayPatch(slipId, "memo", "시도",
                callerId.toString(), null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        // 완전 잠금 — APPROVED 조회 자체 skip
        verify(editRequestService, never()).findActiveApproval(any());
        verify(editRequestService, never()).consumeApproval(any(), any());
    }

    @Test
    void softDelete_deliveredStage_alwaysFullyLocked_throwsConflict() {
        slip.save();
        slip.send();
        slip.accept(callerId.toString());
        slip.process();
        slip.complete();
        slip.inspect(callerId.toString()); // INSPECTING → COMPLETED
        slip.ship(); // COMPLETED → SHIPPING
        slip.deliver(); // SHIPPING → DELIVERED
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> slipService.softDelete(slipId, callerId.toString()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);

        verify(editRequestService, never()).findActiveApproval(any());
        // soft-delete 미수행 검증
        assertThat(slip.getIsDeleted()).isFalse();
    }
}
