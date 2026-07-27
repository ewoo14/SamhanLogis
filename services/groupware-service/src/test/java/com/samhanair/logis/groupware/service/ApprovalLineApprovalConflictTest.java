package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
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
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 승인 시 revision self-heal 최종 flush 충돌이 {@link ApprovalLineService#approve(UUID, UUID, Set)} 공개
 * 경로 호출자에게 generic 500이 아닌 typed {@code CONFLICT} 로 전달되는지 검증한다.
 *
 * <p>일반 양식 CRUD의 {@link DocumentTemplateRevisionService#ensureCurrentRevision}는 즉시 flush하며
 * 내부에서 unique 충돌을 typed {@code CONFLICT}로 변환한다. 승인 경로의
 * {@code ensureCurrentRevisionForApproval}은 approval_lines pin과 원자적으로 flush하기 위해 저장만
 * 예약하므로, unique 충돌은 승인 저장소 flush에서 발생해 {@code ApprovalLineService}가 변환한다.
 *
 * <p>아래는 실제 승인 경로의 flush에서 raw {@code DataIntegrityViolationException}이 발생했을 때
 * caller가 이를 typed {@code CONFLICT}로 바꾸는 계약을 검증한다.
 */
class ApprovalLineApprovalConflictTest {

    @Test
    void revisionServiceConflict_propagatesAsBusinessConflict_notSwallowedOrRewrapped() {
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
        DocumentTemplate template = mock(DocumentTemplate.class);
        when(templateRepository.findFirstByDocTypeAndStatusAndIsDeletedFalse(
                        "GROUPWARE_SELF_HEAL_CONFLICT", DocumentTemplateStatus.ACTIVE))
                .thenReturn(Optional.of(template));
        when(template.getId()).thenReturn(UUID.randomUUID());
        when(template.getRevision()).thenReturn(1);
        when(revisionService.ensureCurrentRevisionForApproval(any(DocumentTemplate.class))).thenReturn(null);
        doThrow(new org.springframework.dao.DataIntegrityViolationException("revision unique conflict"))
                .when(approvalRepository).flush();

        assertThatThrownBy(() -> service.approve(approvalId, approver, Set.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> assertThat(((BusinessException) error).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }
}
