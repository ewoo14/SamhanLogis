package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalStatus;
import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 결재선 라이프사이클 service — 생성 / 조회 / 승인 / 반려 / 회수.
 *
 * <p>chain 흐름:
 * <ol>
 *   <li>{@link #create} — 요청자 + chain (1명 이상 결재자) 으로 PENDING 상태 결재선 발의.</li>
 *   <li>{@link #approve} — 현재 step 결재자가 승인. 모든 step 승인 시 결재선 APPROVED.</li>
 *   <li>{@link #reject} — 현재 step 결재자가 반려. 즉시 결재선 REJECTED.</li>
 *   <li>{@link #withdraw} — 요청자 본인 회수. 종료 상태에서는 거부.</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class ApprovalLineService {

    private final ApprovalLineRepository repository;
    private final UserClient userClient;
    private final ApprovalNumberService approvalNumberService;
    private final ApprovalTemplateService approvalTemplateService;

    /**
     * 신규 결재선 생성 + chain 등록. 요청자 본인 차단 / 결재자 0명 차단 / 사용자 미존재 차단 가드.
     *
     * @param req 결재선 생성 요청
     * @return 영속화된 결재선
     */
    @Transactional
    public ApprovalLine create(ApprovalLineCreateRequest req) {
        if (req.approverIds() == null || req.approverIds().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재자 1명 이상 필요");
        }
        // Phase 9 W3 — BE backlog #4 채택. 요청자 + 결재자 N 명을 1회 bulk RPC 로 검증
        // (이전: 직렬 N+1 RPC, 현재: 1 RPC + cache hit 기대).
        List<UUID> idsToVerify = new ArrayList<>();
        idsToVerify.add(req.requesterId());
        idsToVerify.addAll(req.approverIds());
        Map<UUID, Boolean> existsMap = userClient.verifyBulk(idsToVerify);
        if (!Boolean.TRUE.equals(existsMap.get(req.requesterId()))) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "요청자 미존재: " + req.requesterId());
        }
        for (UUID approverId : req.approverIds()) {
            if (!Boolean.TRUE.equals(existsMap.get(approverId))) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "결재자 미존재: " + approverId);
            }
        }
        ApprovalLine line = ApprovalLine.open(
                approvalNumberService.next(), req.requesterId(), req.title(), req.content());
        if (req.templateId() != null) {
            Map<String, String> normalized =
                    approvalTemplateService.validateFieldValues(req.templateId(), req.fieldValues());
            line.applyTemplateValues(req.templateId(), approvalTemplateService.writeFieldValues(normalized));
        }
        for (UUID approverId : req.approverIds()) {
            line.appendStep(approverId);
        }
        return repository.save(line);
    }

    /** 단건 조회. 미존재 시 404. */
    @Transactional(readOnly = true)
    public ApprovalLine findById(UUID approvalId) {
        return repository.findById(approvalId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재선을 찾을 수 없습니다: " + approvalId));
    }

    /** 관리자 결재 문서 목록 조회. status/requesterId 는 선택 필터이며 응답 DTO 로 반환한다. */
    @Transactional(readOnly = true)
    public List<ApprovalLineAdminResponse> findAll(ApprovalStatus status, UUID requesterId) {
        List<ApprovalLine> lines;
        if (status != null && requesterId != null) {
            lines = repository.findAllByRequesterIdAndStatusOrderByCreatedAtDesc(requesterId, status);
        } else if (status != null) {
            lines = repository.findAllByStatusOrderByCreatedAtDesc(status);
        } else if (requesterId != null) {
            lines = repository.findAllByRequesterIdOrderByCreatedAtDesc(requesterId);
        } else {
            lines = repository.findAllByOrderByCreatedAtDesc();
        }
        return lines.stream().map(this::toResponse).toList();
    }

    /** 관리자 결재 문서 상세 조회. */
    @Transactional(readOnly = true)
    public ApprovalLineAdminResponse findResponseById(UUID approvalId) {
        return toResponse(findById(approvalId));
    }

    /** 결재선 entity 를 관리자 응답 DTO 로 변환한다. */
    @Transactional(readOnly = true)
    public ApprovalLineAdminResponse toResponse(ApprovalLine line) {
        String templateName = approvalTemplateService.findTemplateNameOrNull(line.getTemplateId());
        Map<String, String> fieldValues = approvalTemplateService.readFieldValues(line.getFieldValuesJson());
        return ApprovalLineAdminResponse.from(line, templateName, fieldValues);
    }

    /** 결재자 승인 처리 — chain 의 현재 step 결재자만 호출 허용. */
    @Transactional
    public ApprovalLine approve(UUID approvalId, UUID approverId) {
        ApprovalLine line = findById(approvalId);
        try {
            line.approve(approverId);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        return line;
    }

    /** 결재자 반려 처리. */
    @Transactional
    public ApprovalLine reject(UUID approvalId, UUID approverId, String reason) {
        ApprovalLine line = findById(approvalId);
        try {
            line.reject(approverId, reason);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        return line;
    }

    /** 요청자 본인 회수. */
    @Transactional
    public ApprovalLine withdraw(UUID approvalId, UUID actorUserId) {
        ApprovalLine line = findById(approvalId);
        try {
            line.withdraw(actorUserId);
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        return line;
    }
}
