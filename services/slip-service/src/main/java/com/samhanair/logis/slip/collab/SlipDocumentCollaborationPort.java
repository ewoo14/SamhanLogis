package com.samhanair.logis.slip.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.SlipService;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 입출고전표 협업 포트.
 *
 * <p>collab-core 는 changeSet 구조만 전달하고 실제 mutation 은 본 포트가 기존 전표 도메인 경로로
 * 연결한다. 1차 범위는 {@link Slip#applyOverlayPatch} 가 지원하는 overlay 필드이며, 수락 시
 * {@link SlipService#applyOverlayPatch} 를 호출해 audit log/SSE/full-snapshot revision 을 그대로 남긴다.
 */
public class SlipDocumentCollaborationPort implements DocumentCollaborationPort {

    /** 제안/수락 권한은 기존 overlay 수정 page-code 를 재사용한다. */
    public static final String SLIP_COLLAB_PAGE_CODE = "slip.audit-overlay";

    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);
    private static final String SYSTEM_ACTOR_NAME = "협업 제안";
    private static final String SYSTEM_RESTORE_ACTOR_NAME = "협업 복원";

    private final CollabDocumentType documentType;
    private final SlipRepository slipRepository;
    private final SlipService slipService;
    private final SlipRevisionService revisionService;
    private final ObjectMapper objectMapper;
    private final SlipRevisionRepository revisionRepository;
    private final SlipCollabSuggestionRepository suggestionRepository;
    private final SlipCollabCommentRepository commentRepository;

    public SlipDocumentCollaborationPort(SlipRepository slipRepository,
                                         SlipService slipService,
                                         SlipRevisionService revisionService,
                                         ObjectMapper objectMapper) {
        this(CollabDocumentType.SLIP_OUTBOUND, slipRepository, slipService, revisionService,
                objectMapper, null, null, null);
    }

    public SlipDocumentCollaborationPort(CollabDocumentType documentType,
                                         SlipRepository slipRepository,
                                         SlipService slipService,
                                         SlipRevisionService revisionService,
                                         ObjectMapper objectMapper) {
        this(documentType, slipRepository, slipService, revisionService, objectMapper,
                null, null, null);
    }

    public SlipDocumentCollaborationPort(SlipRepository slipRepository,
                                         SlipService slipService,
                                         SlipRevisionService revisionService,
                                         ObjectMapper objectMapper,
                                         SlipRevisionRepository revisionRepository,
                                         SlipCollabSuggestionRepository suggestionRepository,
                                         SlipCollabCommentRepository commentRepository) {
        this(CollabDocumentType.SLIP_OUTBOUND, slipRepository, slipService, revisionService,
                objectMapper, revisionRepository, suggestionRepository, commentRepository);
    }

    public SlipDocumentCollaborationPort(CollabDocumentType documentType,
                                         SlipRepository slipRepository,
                                         SlipService slipService,
                                         SlipRevisionService revisionService,
                                         ObjectMapper objectMapper,
                                         SlipRevisionRepository revisionRepository,
                                         SlipCollabSuggestionRepository suggestionRepository,
                                         SlipCollabCommentRepository commentRepository) {
        this.documentType = documentType;
        this.slipRepository = slipRepository;
        this.slipService = slipService;
        this.revisionService = revisionService;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
        this.revisionRepository = revisionRepository;
        this.suggestionRepository = suggestionRepository;
        this.commentRepository = commentRepository;
    }

    @Override
    public CollabDocumentType documentType() {
        return documentType;
    }

    /** 현재 전표 full snapshot 을 JSON 문자열로 반환한다. */
    @Override
    @Transactional(readOnly = true)
    public String loadSnapshot(UUID documentId) {
        Slip slip = loadSlip(documentId);
        try {
            return objectMapper.writeValueAsString(slip.toSnapshot());
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "전표 스냅샷 직렬화 실패");
        }
    }

    /**
     * path → {after} changeSet 을 기존 overlay patch 경로로 적용한다.
     *
     * <p>path 는 {@code memo} 또는 JSON Pointer 형태 {@code /memo} 를 허용한다.
     * 파싱/구조 검증은 {@link #parseChangeSet} 을 재사용한다 — 수정완료 시점
     * {@link #validateChangeSet} 과 동일 규칙 (검증 대칭, 중복 제거).
     */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        applyOverlayPatchBatch(documentId, changeSetJson, SYSTEM_ACTOR_ID, SYSTEM_ACTOR_NAME);
    }

    /**
     * 수정완료 actor 로 overlay batch 를 적용한다.
     *
     * <p>기존 {@link #applyChangeSet} 은 collab-core accept 호환용 시스템 actor 를 사용한다. 1-인
     * 수정완료 endpoint 는 실제 편집자 실명으로 audit/revision 을 남겨야 하므로 본 메서드를 사용한다.
     */
    @Transactional
    public com.samhanair.logis.slip.web.dto.SlipDetailResponse applyOverlayPatchBatch(
            UUID documentId, String changeSetJson, UUID actorId, String actorName) {
        Map<String, String> patches = parseChangeSet(changeSetJson);
        return slipService.applyOverlayPatchBatch(
                documentId, patches, actorId == null ? null : actorId.toString(), actorName);
    }

    /**
     * changeSet JSON 의 구조를 수정완료 시점에 조기 검증한다 (§7 협업 Round C P2).
     *
     * <p>{@link #applyChangeSet} 과 동일한 파싱·after-검증을 재사용한다. 본 검증 없이 제안이 저장되면:
     * <ul>
     *   <li>비JSON 문자열({@code "{broken"}) — jsonb cast 가 INSERT flush 에서 실패해 500.</li>
     *   <li>구조 불량({@code {"memo":"x"}}) — 저장은 되지만 accept 마다 400 이 반복되는
     *       poison suggestion 이 된다.</li>
     * </ul>
     * controller 가 제안 저장 <b>전에</b> 본 메서드를 호출해 잘못된 입력을
     * 400({@link ErrorCode#INVALID_INPUT})으로 거부한다 — accept 측 검증과 대칭.
     *
     * @param changeSetJson 검증 대상 changeSet JSON 문자열
     * @throws BusinessException(INVALID_INPUT) JSON 형식 오류 / 구조 불량 / 적용 필드 0건
     */
    public void validateChangeSet(String changeSetJson) {
        parseChangeSet(changeSetJson);
    }

    /**
     * changeSet 에 현재 전표의 before 값을 보강한다.
     *
     * <p>외부 요청 계약은 path → {after} 이지만 수정 이력 UI 는 old → new diff 를 즉시 보여줘야 한다.
     * 따라서 이력 저장 전 현재 overlay 필드 값을 읽어 path → {before, after} 형태로 정규화한다.
     */
    @Transactional(readOnly = true)
    public String enrichChangeSetWithBefore(UUID documentId, String changeSetJson) {
        Map<String, String> patches = parseChangeSet(changeSetJson);
        Slip slip = loadSlip(documentId);
        com.fasterxml.jackson.databind.node.ObjectNode root = objectMapper.createObjectNode();
        for (Map.Entry<String, String> patch : patches.entrySet()) {
            com.fasterxml.jackson.databind.node.ObjectNode change = objectMapper.createObjectNode();
            String before = slip.readOverlayField(patch.getKey());
            if (before == null) {
                change.putNull("before");
            } else {
                change.put("before", before);
            }
            if (patch.getValue() == null) {
                change.putNull("after");
            } else {
                change.put("after", patch.getValue());
            }
            root.set(patch.getKey(), change);
        }
        try {
            return objectMapper.writeValueAsString(root);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "전표 수정 이력 changeSet 직렬화 실패");
        }
    }

    /**
     * changeSet JSON 을 {@code 필드명 → after 값} map 으로 파싱·검증한다 (propose/accept 공용).
     *
     * <p>각 entry 는 {@code after} 필드를 가진 JSON object 여야 하며, path 는 단일 overlay
     * 필드명({@code memo} 또는 {@code /memo})만 허용한다. 적용할 필드가 0건이면 거부한다.
     *
     * @param changeSetJson changeSet JSON 문자열
     * @return 필드명 → after 값 (입력 순서 보존, after=null 은 필드 clear)
     * @throws BusinessException(INVALID_INPUT) JSON 형식 오류 / 구조 불량 / 적용 필드 0건
     */
    private Map<String, String> parseChangeSet(String changeSetJson) {
        JsonNode root = parseObject(changeSetJson, "changeSet");
        Map<String, String> patches = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String fieldName = normalizePath(entry.getKey());
            JsonNode change = entry.getValue();
            if (change == null || !change.isObject() || !change.has("after")) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "changeSet entry 는 after 필드를 가진 JSON object 여야 합니다: " + entry.getKey());
            }
            JsonNode afterNode = change.get("after");
            patches.put(fieldName, toNullableText(afterNode));
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet 에 적용할 필드가 없습니다");
        }
        return patches;
    }

    /**
     * full snapshot JSON 으로 전표를 복원하고 RESTORE revision 을 캡처한다.
     *
     * <p>일반 UI 복원은 기존 {@code /revisions/{revisionNo}/restore} endpoint 를 사용한다. 본 메서드는
     * collab-core port 계약 충족용이며, 중복 revision 테이블은 만들지 않는다.
     */
    @Override
    @Transactional
    public void restoreSnapshot(UUID documentId, String snapshotJson) {
        Slip slip = loadSlip(documentId);
        try {
            SlipSnapshot snapshot = objectMapper.readValue(snapshotJson, SlipSnapshot.class);
            slip.restoreFromSnapshot(snapshot);
            slipRepository.save(slip);
            revisionService.capture(slip, SlipRevisionType.RESTORE, null,
                    SYSTEM_ACTOR_ID, SYSTEM_RESTORE_ACTOR_NAME, null);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "전표 스냅샷 JSON 형식이 올바르지 않습니다");
        }
    }

    /**
     * 제안 가능 여부를 판정한다.
     *
     * <p><b>권한 판정은 컨트롤러 {@code @RequirePermission(slip.audit-overlay, UPDATE)} 이 담당한다</b>
     * (PermissionAspect 의 {@code X-Is-System-Master} master bypass 포함).
     * 포트의 계정단위 {@code permissionClient.check} 재검은 master bypass 와 분기되어
     * role 보유·master 사용자를 오거부하는 실서버 QA 적발 버그를 초래했다 (2026-06-13).
     *
     * <p>따라서 포트는 <b>무효 actor(null/zero-UUID) 가드만</b> 수행한다.
     * null → 헤더 부재, zero-UUID → 파싱 실패 (controller {@code resolveActorId} 반환값).
     *
     * <p>[[enforcement-real-http-test]] — 실서버 QA 회귀 락인.
     *
     * @param userId   X-User-Id 헤더에서 파싱한 actor UUID (null or zero-UUID = 무효)
     * @param documentId 대상 전표 ID (현재 사용 안 함 — 미래 문서 소유자 체크용 확장점)
     * @return 유효 actor 이면 true; null 또는 zero-UUID 이면 false
     */
    @Override
    public boolean canPropose(UUID userId, UUID documentId) {
        // 헤더 부재(null) 또는 파싱 실패(zero-UUID)인 무효 actor 만 거부한다.
        // 권한(slip.audit-overlay UPDATE) 판정은 컨트롤러 @RequirePermission 이 담당한다.
        return userId != null && !SYSTEM_ACTOR_ID.equals(userId);
    }

    /**
     * 수락/거절 가능 여부를 판정한다.
     *
     * <p>제안과 동일하게 권한 판정은 컨트롤러 {@code @RequirePermission(slip.audit-overlay, UPDATE)} 이
     * 담당하며 포트는 무효 actor 가드만 수행한다. {@link #canPropose} 참조.
     *
     * @param userId   X-User-Id 헤더에서 파싱한 actor UUID (null or zero-UUID = 무효)
     * @param documentId 대상 전표 ID
     * @return 유효 actor 이면 true; null 또는 zero-UUID 이면 false
     */
    @Override
    public boolean canDecide(UUID userId, UUID documentId) {
        return canPropose(userId, documentId);
    }

    /**
     * 입출고전표 수정완료 알림 수신자를 해석한다.
     *
     * <p>입출고전표 레퍼런스 규칙은 아래 소스를 distinct 순서 보존 set 으로 합산한다.
     * <ol>
     *   <li>전표 작성자: {@code requesterId} 와 {@code createdBy}</li>
     *   <li>수정 이력: {@code slip_revisions.actorId},
     *       {@code slip_collab_suggestions.proposerId/decidedById}</li>
     *   <li>코멘트 작성자: {@code slip_collab_comments.authorId}</li>
     *   <li>다음 결재자: {@code dispatcherUserId}, {@code inspectorUserId}</li>
     * </ol>
     * null/blank 값과 현재 수정자 UUID 는 제외한다. 반환 문자열은 UUID 또는 loginId 가 섞일 수 있으며,
     * 발송 service 가 최종 UUID 로 정규화한다.
     *
     * @param documentId 대상 전표 UUID
     * @param excludeUserId 현재 수정자 UUID
     * @return distinct 수신자 식별자 set
     */
    @Override
    @Transactional(readOnly = true)
    public Set<String> resolveNotificationRecipients(UUID documentId, UUID excludeUserId) {
        Slip slip = loadSlip(documentId);
        Set<String> recipients = new LinkedHashSet<>();
        addRecipient(recipients, slip.getRequesterId(), excludeUserId);
        addRecipient(recipients, slip.getCreatedBy(), excludeUserId);
        if (revisionRepository != null) {
            revisionRepository.findBySlipIdOrderByRevisionNoDesc(documentId)
                    .forEach(revision -> addRecipient(
                            recipients,
                            revision.getActorId() == null ? null : revision.getActorId().toString(),
                            excludeUserId));
        }
        if (suggestionRepository != null) {
            suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType, documentId)
                    .forEach(suggestion -> {
                        addRecipient(recipients, suggestion.getProposerId().toString(), excludeUserId);
                        addRecipient(recipients,
                                suggestion.getDecidedById() == null ? null : suggestion.getDecidedById().toString(),
                                excludeUserId);
                    });
        }
        if (commentRepository != null) {
            commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType, documentId)
                    .forEach(comment -> addRecipient(recipients, comment.getAuthorId().toString(), excludeUserId));
        }
        addRecipient(recipients, slip.getDispatcherUserId(), excludeUserId);
        addRecipient(recipients, slip.getInspectorUserId(), excludeUserId);
        return recipients;
    }

    private Slip loadSlip(UUID documentId) {
        return slipRepository.findById(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "전표를 찾을 수 없습니다: " + documentId));
    }

    private void addRecipient(Set<String> recipients, String rawUserId, UUID excludeUserId) {
        if (rawUserId == null || rawUserId.isBlank()) {
            return;
        }
        String normalized = rawUserId.trim();
        if (excludeUserId != null && excludeUserId.toString().equals(normalized)) {
            return;
        }
        recipients.add(normalized);
    }

    private JsonNode parseObject(String json, String label) {
        if (json == null || json.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, label + " 은 필수입니다");
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        label + " 은 JSON object 여야 합니다");
            }
            return node;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + " JSON 형식이 올바르지 않습니다");
        }
    }

    private String normalizePath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet path 는 필수입니다");
        }
        String normalized = rawPath.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        if (normalized.contains("/")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "1차 전표 협업은 overlay 필드 path 만 지원합니다: " + rawPath);
        }
        return normalized;
    }

    private String toNullableText(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isTextual() || node.isNumber() || node.isBoolean()) {
            return node.asText();
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "changeSet after 값을 문자열로 변환할 수 없습니다");
        }
    }

    /**
     * documentType 별 포트 bean 생성 factory.
     *
     * <p>권한 판정을 포트에서 제거함에 따라 {@code DynamicPermissionClient} 의존이 삭제됐다.
     * 권한은 컨트롤러 {@code @RequirePermission} Aspect 가 일괄 처리한다.
     */
    @Component
    public static class Factory {
        private final SlipRepository slipRepository;
        private final SlipService slipService;
        private final SlipRevisionService revisionService;
        private final ObjectMapper objectMapper;
        private final SlipRevisionRepository revisionRepository;
        private final SlipCollabSuggestionRepository suggestionRepository;
        private final SlipCollabCommentRepository commentRepository;

        public Factory(SlipRepository slipRepository,
                       SlipService slipService,
                       SlipRevisionService revisionService,
                       ObjectMapper objectMapper,
                       SlipRevisionRepository revisionRepository,
                       SlipCollabSuggestionRepository suggestionRepository,
                       SlipCollabCommentRepository commentRepository) {
            this.slipRepository = slipRepository;
            this.slipService = slipService;
            this.revisionService = revisionService;
            this.objectMapper = objectMapper;
            this.revisionRepository = revisionRepository;
            this.suggestionRepository = suggestionRepository;
            this.commentRepository = commentRepository;
        }

        public SlipDocumentCollaborationPort create(CollabDocumentType documentType) {
            return new SlipDocumentCollaborationPort(documentType, slipRepository, slipService,
                    revisionService, objectMapper, revisionRepository, suggestionRepository,
                    commentRepository);
        }
    }
}
