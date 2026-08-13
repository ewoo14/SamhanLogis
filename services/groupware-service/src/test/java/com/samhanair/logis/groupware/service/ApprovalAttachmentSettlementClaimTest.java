package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.AccountingSettlementApprovalClaimClient;
import com.samhanair.logis.groupware.domain.ApprovalAttachment;
import com.samhanair.logis.groupware.domain.ApprovalAttachmentType;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalReferenceDocType;
import com.samhanair.logis.groupware.dto.ApprovalAttachmentRequest;
import com.samhanair.logis.groupware.repository.ApprovalAttachmentRepository;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.storage.ApprovalAttachmentStorage;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** D-G7 groupware 첨부 시점 상태 확인·보상 claim 계약. */
class ApprovalAttachmentSettlementClaimTest {

    private final ApprovalLineRepository approvalRepository = mock(ApprovalLineRepository.class);
    private final ApprovalAttachmentRepository attachmentRepository = mock(ApprovalAttachmentRepository.class);
    private final ApprovalAttachmentStorage storage = mock(ApprovalAttachmentStorage.class);
    private final AccountingSettlementApprovalClaimClient claimClient =
            mock(AccountingSettlementApprovalClaimClient.class);
    private final UUID approvalId = UUID.randomUUID();
    private final UUID claimToken = UUID.randomUUID();
    private final ApprovalLine approval = ApprovalLine.open(
            "2026/08/11-approval-1", UUID.randomUUID(), "정산 결재", "본문");

    @Test
    void settlementReference_reservesAndActivatesClaimBeforeLocalSave() {
        when(approvalRepository.findFlatById(approvalId)).thenReturn(Optional.of(approval));
        when(claimClient.reserve("2026/08/11-3", approvalId)).thenReturn(claimToken);

        ApprovalAttachmentService service = service();
        service.addReference(approvalId, request("2026/08/11-3"));

        verify(claimClient).reserve("2026/08/11-3", approvalId);
        verify(claimClient).activate(claimToken);
        verify(attachmentRepository).save(any(ApprovalAttachment.class));
    }

    @Test
    void settlementReference_saveFailure_releasesClaimAsCompensation() {
        when(approvalRepository.findFlatById(approvalId)).thenReturn(Optional.of(approval));
        when(claimClient.reserve("2026/08/11-3", approvalId)).thenReturn(claimToken);
        doThrow(new RuntimeException("groupware DB write failed"))
                .when(attachmentRepository).save(any(ApprovalAttachment.class));

        assertThatThrownBy(() -> service().addReference(approvalId, request("2026/08/11-3")))
                .isInstanceOf(RuntimeException.class);

        verify(claimClient).release(claimToken);
    }

    @Test
    void settlementReference_claimReservationRejectsStaleDraftBeforeAttachmentSave() {
        when(approvalRepository.findFlatById(approvalId)).thenReturn(Optional.of(approval));
        doThrow(new BusinessException(ErrorCode.CONFLICT, "DRAFT settlement"))
                .when(claimClient).reserve("2026/08/11-3", approvalId);

        assertThatThrownBy(() -> service().addReference(approvalId, request("2026/08/11-3")))
                .isInstanceOf(BusinessException.class);

        verifyNoInteractions(attachmentRepository);
    }

    @Test
    void atomicSettlementReference_expiredDeadlineDoesNotOpenAnotherClaim() {
        assertThatThrownBy(() -> service().addReferencesAtomically(
                approval, List.of(request("2026/08/11-3")), System.nanoTime() - 1))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("결재 생성 시간이 제한을 초과했습니다");

        verifyNoInteractions(claimClient, attachmentRepository);
    }

    @Test
    void settlementReference_delete_releasesOnlyThatSettlementClaim() {
        ApprovalLine approvalForDelete = mock(ApprovalLine.class);
        when(approvalForDelete.getId()).thenReturn(approvalId);
        ApprovalAttachment attachment = ApprovalAttachment.documentRef(
                approvalForDelete, "정산서", 0, ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT,
                "2026/08/11-3", "정산서");
        when(approvalRepository.findFlatById(approvalId)).thenReturn(Optional.of(approvalForDelete));
        when(attachmentRepository.findById(any())).thenReturn(Optional.of(attachment));
        UUID attachmentId = UUID.randomUUID();
        when(attachmentRepository.existsOtherActiveReference(
                approvalId, ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT, "2026/08/11-3", attachmentId))
                .thenReturn(false);

        service().delete(approvalId, attachmentId, "tester");

        verify(claimClient).releaseByApprovalReference(approvalId, "2026/08/11-3");
    }

    private ApprovalAttachmentService service() {
        return new ApprovalAttachmentService(approvalRepository, attachmentRepository, storage, claimClient);
    }

    private ApprovalAttachmentRequest request(String documentNo) {
        return new ApprovalAttachmentRequest(
                ApprovalAttachmentType.SLIP_REF, "정산서", 0, null, null, null, null, null,
                ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT, documentNo, "정산서");
    }
}
