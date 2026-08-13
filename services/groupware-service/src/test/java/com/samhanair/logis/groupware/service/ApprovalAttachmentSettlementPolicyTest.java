package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.groupware.domain.ApprovalReferenceDocType;
import com.samhanair.logis.groupware.repository.ApprovalAttachmentRepository;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.storage.ApprovalAttachmentStorage;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** 정산 확정 취소를 차단하는 결재 상태 집합 계약 테스트. */
class ApprovalAttachmentSettlementPolicyTest {

    @Test
    void activeSettlementApproval_meansPendingInProgressOrApproved() {
        ApprovalAttachmentRepository attachmentRepository = org.mockito.Mockito.mock(
                ApprovalAttachmentRepository.class);
        when(attachmentRepository.existsByRefDocTypeAndRefDocNoAndApproval_StatusIn(
                eq(ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT), eq("2026/08/11-1"),
                org.mockito.ArgumentMatchers.anySet())).thenReturn(true);
        ApprovalAttachmentService service = new ApprovalAttachmentService(
                org.mockito.Mockito.mock(ApprovalLineRepository.class), attachmentRepository,
                org.mockito.Mockito.mock(ApprovalAttachmentStorage.class));

        assertThat(service.hasActiveSettlementApproval(" 2026/08/11-1 ")).isTrue();

        ArgumentCaptor<Set<ApprovalStatus>> statuses = ArgumentCaptor.forClass(Set.class);
        verify(attachmentRepository).existsByRefDocTypeAndRefDocNoAndApproval_StatusIn(
                eq(ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT), eq("2026/08/11-1"), statuses.capture());
        assertThat(statuses.getValue()).containsExactlyInAnyOrder(
                ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS, ApprovalStatus.APPROVED);
    }
}
