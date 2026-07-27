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
 * 승인 시 revision self-heal 충돌이 {@link ApprovalLineService#approve(UUID, UUID, Set)} 공개 경로 호출자에게
 * generic 500이 아닌 typed {@code CONFLICT} 로 전달되는지 검증한다.
 *
 * <p><b>R3 false-green fix</b>: 원래 이 테스트는 {@code revisionService.ensureCurrentRevision}가
 * raw {@link org.springframework.dao.DataIntegrityViolationException}를 던진다고 가정했다.
 * 하지만 실제 구현({@link DocumentTemplateRevisionService#ensureCurrentRevision})은 그 예외를
 * <b>자기 내부에서</b> 잡아 이미 {@code BusinessException(CONFLICT)}로 변환해 던진다 — 같은
 * 커밋의 {@code DocumentTemplateIT#concurrentRevisionSelfHeal_uniqueConflict_isTypedConflict_notGeneric500}
 * (실 Postgres 동시성 테스트)가 그 변환을 정확히 검증한다. 즉 raw DIVE는 이 지점까지 올라오지
 * 않는다 — mock으로 그렇게 만들 수는 있지만, 그건 실제로 일어날 수 없는 계약이다.
 *
 * <p>그 결과 이 테스트는 (a) {@code ApprovalLineService.approve()}의 outer
 * {@code catch (DataIntegrityViolationException)}를 "도달 불가 죽은 분기"인 채로도 계속
 * green으로 통과시켰고, (b) {@code DocumentTemplateRevisionService}에서 실제 방어(내부 변환)를
 * 제거해도 이 테스트는 전혀 감지하지 못했다(RED-first 검증: 내부 catch를 격리 조건에서
 * 제거한 뒤 이 테스트만 단독 실행 — BUILD SUCCESSFUL, 즉 false-green 확정). 이 테스트가
 * 실제로 방어해야 할 것은 번역 자체(그건 위 IT의 책임)가 아니라 <b>caller-side 계약</b> —
 * 즉 {@code approve()}가 이미 typed된 {@code CONFLICT}를 삼키거나 다른 코드로 재포장하지
 * 않고 그대로 전달하는가다. 아래는 그 실제 계약을 검증한다.
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
        when(templateRepository.findFirstByDocTypeAndStatusAndIsDeletedFalse(
                "GROUPWARE_SELF_HEAL_CONFLICT", DocumentTemplateStatus.ACTIVE))
                .thenReturn(Optional.of(mock(DocumentTemplate.class)));
        // 실제로 ensureCurrentRevision이 던질 수 있는 유일한 형태 — 이미 변환된 typed CONFLICT.
        // raw DataIntegrityViolationException은 이 경계 밖으로 나오지 않는다(위 Javadoc 근거).
        BusinessException revisionConflict = new BusinessException(ErrorCode.CONFLICT,
                "문서 양식 revision 생성 경합이 발생했습니다. 다시 시도해 주세요");
        doThrow(revisionConflict).when(revisionService).ensureCurrentRevision(any(DocumentTemplate.class));

        assertThatThrownBy(() -> service.approve(approvalId, approver, Set.of()))
                .isSameAs(revisionConflict)
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> assertThat(((BusinessException) error).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }
}
