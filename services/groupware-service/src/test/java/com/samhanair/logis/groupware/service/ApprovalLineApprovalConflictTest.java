package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.GroupwareApprovalLineConfigClient;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.DocumentTemplateStatus;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.DocumentTemplateRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/** 승인 시 revision self-heal 충돌이 generic 500이 아닌 typed conflict로 수렴하는지 검증한다. */
class ApprovalLineApprovalConflictTest {

    @Test
    void concurrentRevisionSelfHealConflict_isTranslatedToBusinessConflict() {
        ApprovalLineRepository approvalRepository = mock(ApprovalLineRepository.class);
        UserClient userClient = mock(UserClient.class);
        ApprovalNumberService numberService = mock(ApprovalNumberService.class);
        ApprovalTemplateService approvalTemplateService = mock(ApprovalTemplateService.class);
        GroupwareApprovalLineConfigClient configClient = mock(GroupwareApprovalLineConfigClient.class);
        DocumentTemplateRepository templateRepository = mock(DocumentTemplateRepository.class);
        DocumentTemplateRevisionService revisionService = mock(DocumentTemplateRevisionService.class);
        ApprovalLineService service = new ApprovalLineService(
                approvalRepository, userClient, numberService, approvalTemplateService, configClient,
                templateRepository, revisionService);

        UUID approvalId = UUID.randomUUID();
        UUID approver = UUID.randomUUID();
        ApprovalLine line = ApprovalLine.open("2099/01/01-847", UUID.randomUUID(), "self-heal 충돌", "본문");
        line.linkGroupwareDocument("GROUPWARE_SELF_HEAL_CONFLICT", null).appendStep(approver);
        when(approvalRepository.findById(approvalId)).thenReturn(Optional.of(line));
        when(templateRepository.findFirstByDocTypeAndStatusAndIsDeletedFalse(
                "GROUPWARE_SELF_HEAL_CONFLICT", DocumentTemplateStatus.ACTIVE))
                .thenReturn(Optional.of(mock(DocumentTemplate.class)));
        doThrow(new DataIntegrityViolationException("duplicate (template_id, revision)"))
                .when(revisionService).ensureCurrentRevision(any(DocumentTemplate.class));

        assertThatThrownBy(() -> service.approve(approvalId, approver))
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
                        ((BusinessException) error).getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
    }
}
