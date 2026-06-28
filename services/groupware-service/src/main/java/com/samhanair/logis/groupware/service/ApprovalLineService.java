package com.samhanair.logis.groupware.service;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.GroupwareApprovalLineConfigClient;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ResolvedRole;
import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
    private final GroupwareApprovalLineConfigClient configClient;

    /**
     * 신규 결재선 생성 + chain 등록. 요청자 본인 차단 / 결재자 0명 차단 / 사용자 미존재 차단 가드.
     *
     * <p>요청자는 {@code req.requesterId()} 를 사용한다. 헤더 기반 신원이 필요한 경우
     * {@link #createWithActor(ApprovalLineCreateRequest, UUID)} 를 사용한다.
     *
     * @param req 결재선 생성 요청
     * @return 영속화된 결재선
     */
    @Transactional
    public ApprovalLine create(ApprovalLineCreateRequest req) {
        return createInternal(req, req.requesterId());
    }

    /**
     * 신규 결재선 생성 + chain 등록 — 게이트웨이 주입 헤더 신원 기반.
     *
     * <p>컨트롤러가 {@code X-User-Id} 헤더에서 읽은 {@code actorRequesterId} 를 사용하며
     * {@code req.requesterId()} 는 무시한다. identity spoofing 방지
     * ({@code feedback_identity_header_authz_antipattern}).
     *
     * @param req              결재선 생성 요청 (requesterId 본문 필드는 무시됨)
     * @param actorRequesterId 게이트웨이 주입 {@code X-User-Id} 헤더 값
     * @return 영속화된 결재선
     */
    @Transactional
    public ApprovalLine createWithActor(ApprovalLineCreateRequest req, UUID actorRequesterId) {
        return createInternal(req, actorRequesterId);
    }

    private ApprovalLine createInternal(ApprovalLineCreateRequest req, UUID requesterId) {
        List<UUID> overrideApproverIds = safeApproverIds(req.approverIds());
        String documentType = documentTypeFor(req.templateId());
        GroupwareApprovalLineConfigClient.ConfigLine configLine =
                documentType == null ? GroupwareApprovalLineConfigClient.ConfigLine.unconfigured()
                        : configClient.fetchRoles(documentType);
        if (!configLine.configured() && overrideApproverIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재자 1명 이상 필요");
        }
        // Phase 9 W3 — BE backlog #4 채택. 요청자 + 결재자 N 명을 1회 bulk RPC 로 검증
        // (이전: 직렬 N+1 RPC, 현재: 1 RPC + cache hit 기대).
        validateApproverChain(requesterId, overrideApproverIds);
        List<UUID> idsToVerify = userIdsToVerify(requesterId, overrideApproverIds, configLine.roles());
        Map<UUID, Boolean> existsMap = userClient.verifyBulk(idsToVerify);
        if (!Boolean.TRUE.equals(existsMap.get(requesterId))) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "요청자 미존재: " + requesterId);
        }
        for (UUID approverId : idsToVerify) {
            if (!Boolean.TRUE.equals(existsMap.get(approverId))) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "결재자 미존재: " + approverId);
            }
        }
        ApprovalLine line = ApprovalLine.open(
                approvalNumberService.next(), requesterId, req.title(), req.content());
        if (documentType != null) {
            line.linkGroupwareDocument(documentType, req.templateId());
        }
        if (req.templateId() != null) {
            Map<String, String> normalized =
                    approvalTemplateService.validateFieldValues(req.templateId(), req.fieldValues());
            line.applyTemplateValues(req.templateId(), approvalTemplateService.writeFieldValues(normalized));
        }
        try {
            if (configLine.configured()) {
                line.instantiateFromRoles(configLine.roles());
                for (UUID approverId : overrideApproverIds) {
                    line.appendStep(approverId);
                }
            } else {
                for (UUID approverId : overrideApproverIds) {
                    line.appendStep(approverId);
                }
            }
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
        return repository.save(line);
    }

    private List<UUID> userIdsToVerify(UUID requesterId, List<UUID> overrideApproverIds,
                                       List<ResolvedRole> roles) {
        List<UUID> idsToVerify = new ArrayList<>();
        idsToVerify.add(requesterId);
        idsToVerify.addAll(overrideApproverIds);
        roles.stream()
                .filter(role -> role.stepType() == StepType.USER && role.approverUserId() != null)
                .sorted(Comparator.comparingInt(ResolvedRole::sequence))
                .map(ResolvedRole::approverUserId)
                .forEach(idsToVerify::add);
        return idsToVerify.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
    }

    private List<UUID> safeApproverIds(List<UUID> approverIds) {
        return approverIds == null ? List.of() : List.copyOf(approverIds);
    }

    private String documentTypeFor(UUID templateId) {
        String code = approvalTemplateService.findTemplateCodeOrNull(templateId);
        if (code == null || code.isBlank()) {
            return null;
        }
        return "GROUPWARE_" + code.trim();
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
        Map<UUID, String> nameMap = resolveDisplayNames(lines);
        return lines.stream().map(line -> toResponse(line, nameMap)).toList();
    }

    /** 관리자 결재 문서 상세 조회. */
    @Transactional(readOnly = true)
    public ApprovalLineAdminResponse findResponseById(UUID approvalId) {
        return toResponse(findById(approvalId));
    }

    /** 결재선 entity 를 관리자 응답 DTO 로 변환한다. */
    @Transactional(readOnly = true)
    public ApprovalLineAdminResponse toResponse(ApprovalLine line) {
        Map<UUID, String> nameMap = resolveDisplayNames(List.of(line));
        return toResponse(line, nameMap);
    }

    private ApprovalLineAdminResponse toResponse(ApprovalLine line, Map<UUID, String> nameMap) {
        String templateName = approvalTemplateService.findTemplateNameOrNull(line.getTemplateId());
        Map<String, String> fieldValues = approvalTemplateService.readFieldValues(line.getFieldValuesJson());
        return ApprovalLineAdminResponse.from(line, templateName, fieldValues, nameMap);
    }

    private Map<UUID, String> resolveDisplayNames(List<ApprovalLine> lines) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (ApprovalLine line : lines) {
            ids.add(line.getRequesterId());
            line.getStepsView().forEach(step -> {
                if (step.getApproverUserId() != null) {
                    ids.add(step.getApproverUserId());
                }
                // GROUP 단계 실처리자(approve 시 기록된 approvedByUserId) 표시명도 수집한다.
                if (step.getApprovedByUserId() != null) {
                    ids.add(step.getApprovedByUserId());
                }
            });
        }
        ids.removeIf(Objects::isNull);
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> resolvedNames = userClient.resolveDisplayNames(List.copyOf(ids));
        return resolvedNames == null ? Map.of() : resolvedNames;
    }

    private void validateApproverChain(UUID requesterId, List<UUID> approverIds) {
        Set<UUID> seen = new LinkedHashSet<>();
        for (UUID approverId : approverIds) {
            if (approverId == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "결재자는 필수입니다");
            }
            if (approverId.equals(requesterId)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "요청자 본인은 결재자가 될 수 없습니다");
            }
            if (!seen.add(approverId)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "동일 결재자를 결재선에 중복 추가할 수 없습니다");
            }
        }
    }

    /**
     * 결재자 승인 처리 — USER 전용 경로. chain 의 현재 step 결재자만 호출 허용.
     *
     * <p>GROUP 단계가 포함된 결재선에서는 {@link #approve(UUID, UUID, Set)} 를 사용한다.
     */
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

    /**
     * 결재자 승인 처리 — GROUP 단계 컨텍스트를 포함한 경로.
     *
     * <p>게이트웨이 주입 {@code X-User-Groups} 헤더의 그룹 UUID 집합을 함께 전달하면
     * GROUP 단계의 멤버십 검증이 정상 동작한다.
     *
     * @param approvalId    결재선 UUID
     * @param actorUserId   게이트웨이 주입 {@code X-User-Id} 헤더 값
     * @param actorGroupIds 게이트웨이 주입 {@code X-User-Groups} 헤더의 UUID 집합
     * @return 승인 처리된 결재선
     */
    @Transactional
    public ApprovalLine approve(UUID approvalId, UUID actorUserId, Set<UUID> actorGroupIds) {
        ApprovalLine line = findById(approvalId);
        try {
            line.approve(actorUserId, actorGroupIds == null ? Set.of() : actorGroupIds, Set.of());
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        return line;
    }

    /**
     * 결재자 반려 처리 — USER 전용 경로.
     *
     * <p>GROUP 단계가 포함된 결재선에서는 {@link #reject(UUID, UUID, Set, String)} 를 사용한다.
     */
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

    /**
     * 결재자 반려 처리 — GROUP 단계 컨텍스트를 포함한 경로.
     *
     * @param approvalId    결재선 UUID
     * @param actorUserId   게이트웨이 주입 {@code X-User-Id} 헤더 값
     * @param actorGroupIds 게이트웨이 주입 {@code X-User-Groups} 헤더의 UUID 집합
     * @param reason        반려 사유
     * @return 반려 처리된 결재선
     */
    @Transactional
    public ApprovalLine reject(UUID approvalId, UUID actorUserId, Set<UUID> actorGroupIds, String reason) {
        ApprovalLine line = findById(approvalId);
        try {
            line.reject(actorUserId, reason, actorGroupIds == null ? Set.of() : actorGroupIds, Set.of());
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
