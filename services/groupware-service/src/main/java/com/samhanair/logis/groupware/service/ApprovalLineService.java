package com.samhanair.logis.groupware.service;

import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.GroupwareApprovalLineConfigClient;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ResolvedRole;
import com.samhanair.logis.groupware.domain.DocumentTemplateStatus;
import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.policy.SettlementApprovalReferencePolicy;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.DocumentTemplateRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
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
public class ApprovalLineService {

    private final ApprovalLineRepository repository;
    private final UserClient userClient;
    private final ApprovalNumberService approvalNumberService;
    private final ApprovalTemplateService approvalTemplateService;
    private final GroupwareApprovalLineConfigClient configClient;
    private final DocumentTemplateRepository documentTemplateRepository;
    private final DocumentTemplateRevisionService documentTemplateRevisionService;
    private final ApprovalAttachmentService approvalAttachmentService;

    @Autowired
    public ApprovalLineService(ApprovalLineRepository repository, UserClient userClient,
                               ApprovalNumberService approvalNumberService,
                               ApprovalTemplateService approvalTemplateService,
                               GroupwareApprovalLineConfigClient configClient,
                               DocumentTemplateRepository documentTemplateRepository,
                               DocumentTemplateRevisionService documentTemplateRevisionService,
                               ApprovalAttachmentService approvalAttachmentService) {
        this.repository = repository;
        this.userClient = userClient;
        this.approvalNumberService = approvalNumberService;
        this.approvalTemplateService = approvalTemplateService;
        this.configClient = configClient;
        this.documentTemplateRepository = documentTemplateRepository;
        this.documentTemplateRevisionService = documentTemplateRevisionService;
        this.approvalAttachmentService = approvalAttachmentService;
    }

    /** claim client 도입 전 단위 테스트 호환 생성 경계. */
    public ApprovalLineService(ApprovalLineRepository repository, UserClient userClient,
                               ApprovalNumberService approvalNumberService,
                               ApprovalTemplateService approvalTemplateService,
                               GroupwareApprovalLineConfigClient configClient,
                               DocumentTemplateRepository documentTemplateRepository,
                               DocumentTemplateRevisionService documentTemplateRevisionService) {
        this(repository, userClient, approvalNumberService, approvalTemplateService, configClient,
                documentTemplateRepository, documentTemplateRevisionService, null);
    }

    /**
     * 신규 결재선 생성 + chain 등록. 요청자 본인 차단 / 결재자 0명 차단 / 사용자 미존재 차단 가드.
     *
     * <p>요청자는 {@code req.requesterId()} 를 그대로 신뢰한다. <b>HTTP endpoint 에서 직접 호출 금지.</b>
     * 본문의 requesterId 를 신뢰하므로 identity spoofing 위험이 있다. HTTP 요청 처리 시에는 반드시
     * {@link #createWithActor(ApprovalLineCreateRequest, UUID)} 를 사용한다.
     *
     * <p>허용 사용처: IT 테스트, 내부 배치/시드 호출.
     *
     * @param req 결재선 생성 요청
     * @return 영속화된 결재선
     * @deprecated HTTP 미사용. 헤더 기반 신원이 필요한 경우
     *             {@link #createWithActor(ApprovalLineCreateRequest, UUID)} 사용.
     *             IT 테스트·내부 호출에서만 허용.
     */
    @Deprecated
    @Transactional(timeout = SettlementApprovalReferencePolicy.TRANSACTION_TIMEOUT_SECONDS)
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
    @Transactional(timeout = SettlementApprovalReferencePolicy.TRANSACTION_TIMEOUT_SECONDS)
    public ApprovalLine createWithActor(ApprovalLineCreateRequest req, UUID actorRequesterId) {
        return createInternal(req, actorRequesterId);
    }

    private ApprovalLine createInternal(ApprovalLineCreateRequest req, UUID requesterId) {
        long atomicDeadlineNanos = SettlementApprovalReferencePolicy.deadlineNanos();
        SettlementApprovalReferencePolicy.validateAtomicReferenceCount(
                req.references() == null ? 0 : req.references().size());
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
        ApprovalLine saved = repository.save(line);
        if (req.references() != null && !req.references().isEmpty()) {
            if (approvalAttachmentService == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "결재 참조 첨부 서비스가 구성되지 않았습니다");
            }
            approvalAttachmentService.addReferencesAtomically(
                    saved, req.references(), atomicDeadlineNanos);
        }
        return saved;
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
            pinApprovedLayout(line);
            // R3 판단 기록 — 아래 DataIntegrityViolationException catch는 현재 호출 그래프상
            // pinApprovedLayout()이 유발하는 유일한 DIVE(revision self-heal 경합)에는 도달하지
            // 않는다. 그 경합은 DocumentTemplateRevisionService.ensureCurrentRevision()이 이미
            // 내부에서 BusinessException(CONFLICT)로 변환해 던지기 때문이다(ApprovalLineApprovalConflictTest
            // 참고). 그럼에도 이 catch를 남겨둔 이유: line.approve() 로 인한 상태변경이 이 try
            // 블록 안의 후속 SELECT(문서양식 조회)에서 auto-flush 될 때, 이 슬라이스가 도입하지
            // 않은 approval_lines의 다른 제약(향후 슬라이스가 추가할 CHECK 등)이 그 시점에
            // 위반되면 여기서 진짜로 발생할 수 있는 방어선이라 판단해 제거하지 않았다 — 삭제
            // 여부는 판단 필요 항목으로 남긴다(제거해도 현재 테스트 스위트는 깨지지 않는다).
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "승인 당시 문서 양식 각인 경합이 발생했습니다. 다시 시도해 주세요");
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
            pinApprovedLayout(line);
            // R3 판단 기록 — 위 approve(UUID, UUID) 오버로드의 동일 catch 주석 참고.
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "승인 당시 문서 양식 각인 경합이 발생했습니다. 다시 시도해 주세요");
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
        releaseSettlementClaimsAfterCompletion(line);
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
        releaseSettlementClaimsAfterCompletion(line);
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
        releaseSettlementClaimsAfterCompletion(line);
        return line;
    }

    /** 종료 전이의 결재 참조 수명을 accounting claim 수명과 함께 닫는다. */
    private void releaseSettlementClaimsAfterCompletion(ApprovalLine line) {
        if (approvalAttachmentService != null) {
            approvalAttachmentService.releaseSettlementClaimsAfterApprovalCompletion(line.getId());
        }
    }

    /**
     * APPROVED 전이와 같은 transaction에서 현재 ACTIVE layout revision을 각인한다.
     * revision 저장/각인 중 하나라도 실패하면 승인 변경도 함께 rollback되어 부분 성공을 막는다.
     */
    private void pinApprovedLayout(ApprovalLine line) {
        if (line.getStatus() != ApprovalStatus.APPROVED || line.getDocumentType() == null) {
            return;
        }
        documentTemplateRepository.findFirstByDocTypeAndStatusAndIsDeletedFalse(
                        line.getDocumentType(), DocumentTemplateStatus.ACTIVE)
                .ifPresentOrElse(template -> {
                    documentTemplateRevisionService.ensureCurrentRevisionForApproval(template);
                    line.pinDocumentTemplate(template.getId(), template.getRevision());
                }, line::pinDefaultDocumentTemplate);
        // revision INSERT와 APPROVED + pin UPDATE를 같은 flush에서 처리한다. V15는 OLD.status가
        // PENDING인 승인 당시 각인만 허용하므로, 승인 상태만 먼저 flush되는 중간 상태를 만들면 안 된다.
        repository.flush();
    }

}
