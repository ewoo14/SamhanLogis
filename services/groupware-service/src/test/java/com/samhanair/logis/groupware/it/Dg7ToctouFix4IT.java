package com.samhanair.logis.groupware.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.AccountingSettlementApprovalClaimClient;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalAttachmentType;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalReferenceDocType;
import com.samhanair.logis.groupware.dto.ApprovalAttachmentRequest;
import com.samhanair.logis.groupware.repository.ApprovalAttachmentRepository;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.service.ApprovalAttachmentService;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Transactional;

/** D-G7 fix4 RED-A — 종료 결재의 참조 claim 수명을 실제 PostgreSQL transaction에 고정한다. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@Transactional
class Dg7ToctouFix4IT extends AbstractPostgresIT {

    @Autowired private ApprovalLineService approvalLineService;
    @Autowired private ApprovalAttachmentService attachmentService;
    @Autowired private ApprovalLineRepository approvalLineRepository;
    @Autowired private ApprovalAttachmentRepository attachmentRepository;

    @MockBean private UserClient userClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private AccountingSettlementApprovalClaimClient claimClient;

    @Test
    void rejectedApproval_releasesEveryDistinctSettlementReferenceAfterCommit() {
        UUID requester = UUID.randomUUID();
        UUID approver = UUID.randomUUID();
        String first = uniqueDocumentNo("reject");
        String second = uniqueDocumentNo("reject");
        ApprovalLine approval = openApproval(requester, approver);
        when(claimClient.reserve(any(String.class), any(UUID.class))).thenReturn(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        addSettlementReference(approval, first);
        addSettlementReference(approval, first);
        addSettlementReference(approval, second);

        approvalLineService.reject(approval.getId(), approver, "사유 미흡");
        verifyNoInteractionsBeforeCommit();

        commitCurrentTransaction();

        verify(claimClient).releaseByApprovalReference(approval.getId(), first);
        verify(claimClient).releaseByApprovalReference(approval.getId(), second);
    }

    @Test
    void groupRejectedApproval_releasesSettlementReferenceAfterCommit() {
        UUID requester = UUID.randomUUID();
        UUID approver = UUID.randomUUID();
        String documentNo = uniqueDocumentNo("group-reject");
        ApprovalLine approval = openApproval(requester, approver);
        when(claimClient.reserve(any(String.class), any(UUID.class))).thenReturn(UUID.randomUUID());
        addSettlementReference(approval, documentNo);

        approvalLineService.reject(approval.getId(), approver, java.util.Set.of(), "사유 미흡");
        commitCurrentTransaction();

        verify(claimClient).releaseByApprovalReference(approval.getId(), documentNo);
    }

    @Test
    void withdrawnApproval_releasesSettlementReferenceAfterCommit() {
        UUID requester = UUID.randomUUID();
        UUID approver = UUID.randomUUID();
        String documentNo = uniqueDocumentNo("withdraw");
        ApprovalLine approval = openApproval(requester, approver);
        when(claimClient.reserve(any(String.class), any(UUID.class))).thenReturn(UUID.randomUUID());
        addSettlementReference(approval, documentNo);

        approvalLineService.withdraw(approval.getId(), requester);
        commitCurrentTransaction();

        verify(claimClient).releaseByApprovalReference(approval.getId(), documentNo);
    }

    @Test
    void rejectedApproval_rollbackDoesNotReleaseClaimOrLeaveTerminalApproval() {
        UUID requester = UUID.randomUUID();
        UUID approver = UUID.randomUUID();
        String documentNo = uniqueDocumentNo("rollback");
        ApprovalLine approval = openApproval(requester, approver);
        when(claimClient.reserve(any(String.class), any(UUID.class))).thenReturn(UUID.randomUUID());
        addSettlementReference(approval, documentNo);

        approvalLineService.reject(approval.getId(), approver, "사유 미흡");
        TestTransaction.flagForRollback();
        TestTransaction.end();
        TestTransaction.start();

        org.mockito.Mockito.verify(claimClient, org.mockito.Mockito.never())
                .releaseByApprovalReference(any(UUID.class), any(String.class));
        org.assertj.core.api.Assertions.assertThat(approvalLineRepository.findById(approval.getId())).isEmpty();
        org.assertj.core.api.Assertions.assertThat(attachmentRepository.findAll()).isEmpty();
    }

    private ApprovalLine openApproval(UUID requester, UUID approver) {
        ApprovalLine approval = ApprovalLine.open(uniqueApprovalNo(), requester, "정산 참조 결재", "본문");
        approval.appendStep(approver);
        return approvalLineRepository.saveAndFlush(approval);
    }

    private void addSettlementReference(ApprovalLine approval, String documentNo) {
        attachmentService.addReference(approval.getId(), new ApprovalAttachmentRequest(
                ApprovalAttachmentType.SLIP_REF, "영업수수료 정산서", 0,
                null, null, null, null, null, ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT,
                documentNo, "영업수수료 정산서"));
    }

    private void verifyNoInteractionsBeforeCommit() {
        // reserve/activate are expected; the terminal transition must not release before commit.
        org.mockito.Mockito.verify(claimClient, org.mockito.Mockito.never())
                .releaseByApprovalReference(any(UUID.class), any(String.class));
    }

    private void commitCurrentTransaction() {
        TestTransaction.flagForCommit();
        TestTransaction.end();
        TestTransaction.start();
    }

    private String uniqueApprovalNo() {
        return "f4-" + UUID.randomUUID().toString().substring(0, 26);
    }

    private String uniqueDocumentNo(String prefix) {
        return "f4-" + prefix.substring(0, 1) + "-"
                + UUID.randomUUID().toString().substring(0, 34);
    }
}
