package com.samhanair.logis.slip.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.SlipService;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
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
    private final DynamicPermissionClient permissionClient;
    private final ObjectMapper objectMapper;

    public SlipDocumentCollaborationPort(SlipRepository slipRepository,
                                         SlipService slipService,
                                         SlipRevisionService revisionService,
                                         DynamicPermissionClient permissionClient,
                                         ObjectMapper objectMapper) {
        this(CollabDocumentType.SLIP_OUTBOUND, slipRepository, slipService, revisionService,
                permissionClient, objectMapper);
    }

    public SlipDocumentCollaborationPort(CollabDocumentType documentType,
                                         SlipRepository slipRepository,
                                         SlipService slipService,
                                         SlipRevisionService revisionService,
                                         DynamicPermissionClient permissionClient,
                                         ObjectMapper objectMapper) {
        this.documentType = documentType;
        this.slipRepository = slipRepository;
        this.slipService = slipService;
        this.revisionService = revisionService;
        this.permissionClient = permissionClient;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
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
     */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        JsonNode root = parseObject(changeSetJson, "changeSet");
        Map<String, String> patches = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String fieldName = normalizePath(entry.getKey());
            JsonNode afterNode = entry.getValue() == null ? null : entry.getValue().get("after");
            patches.put(fieldName, toNullableText(afterNode));
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet 에 적용할 필드가 없습니다");
        }
        // 단일 잠금 가드 + APPROVED 1회 소진 + EDIT revision 1건으로 일괄 적용 (제안 1건 = 변경 1건).
        // 필드마다 applyOverlayPatch 를 호출하면 잠금 전표에서 둘째 필드가 CONFLICT 되고 revision 이 오염된다.
        slipService.applyOverlayPatchBatch(documentId, patches, "collab-core", SYSTEM_ACTOR_NAME);
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

    @Override
    public boolean canPropose(UUID userId, UUID documentId) {
        // 헤더 부재/파싱 실패 시 controller 가 넘기는 zero-UUID(SYSTEM_ACTOR_ID)는 무효 actor 로 거부한다.
        // (null 아님이라 단순 != null 검사를 통과하므로 명시적 zero 거부 필요)
        return userId != null
                && !SYSTEM_ACTOR_ID.equals(userId)
                && permissionClient.check(userId, SLIP_COLLAB_PAGE_CODE, PermissionAction.UPDATE);
    }

    @Override
    public boolean canDecide(UUID userId, UUID documentId) {
        return canPropose(userId, documentId);
    }

    private Slip loadSlip(UUID documentId) {
        return slipRepository.findById(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "전표를 찾을 수 없습니다: " + documentId));
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

    /** documentType 별 포트 bean 생성 factory. */
    @Component
    public static class Factory {
        private final SlipRepository slipRepository;
        private final SlipService slipService;
        private final SlipRevisionService revisionService;
        private final DynamicPermissionClient permissionClient;
        private final ObjectMapper objectMapper;

        public Factory(SlipRepository slipRepository,
                       SlipService slipService,
                       SlipRevisionService revisionService,
                       DynamicPermissionClient permissionClient,
                       ObjectMapper objectMapper) {
            this.slipRepository = slipRepository;
            this.slipService = slipService;
            this.revisionService = revisionService;
            this.permissionClient = permissionClient;
            this.objectMapper = objectMapper;
        }

        public SlipDocumentCollaborationPort create(CollabDocumentType documentType) {
            return new SlipDocumentCollaborationPort(documentType, slipRepository, slipService,
                    revisionService, permissionClient, objectMapper);
        }
    }
}
