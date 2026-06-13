package com.samhanair.logis.accounting.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회계전표 협업 포트.
 *
 * <p>collab-core 는 changeSet 구조만 전달하고 실제 mutation 은 본 포트가 Journal 도메인 경로로
 * 연결한다. 편집 범위는 회계 무결성에 영향이 없는 적요({@code description})와 라인메모
 * ({@code line.{lineNo}.memo})만 허용한다. 차대변 금액/계정/일자/전표번호는 원장 필드이므로
 * 400으로 거부한다.
 */
@Component
public class JournalDocumentCollaborationPort implements DocumentCollaborationPort {

    /** 회계전표 협업 권한은 기존 분개장 page-code 를 재사용한다. */
    public static final String JOURNAL_COLLAB_PAGE_CODE = "accounting.journals";

    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);
    private static final String SYSTEM_ACTOR_NAME = "협업 제안";
    private static final Pattern LINE_MEMO_PATH = Pattern.compile("^line\\.(\\d+)\\.memo$");
    private static final Set<String> LEDGER_HEADER_FIELDS = Set.of(
            "journalNo", "journalDate", "status", "sourceType", "sourceRefId", "sourceRef",
            "postedAt", "postedBy", "reversedJournalId", "totalDebit", "totalCredit");
    private static final Set<String> LEDGER_LINE_FIELDS = Set.of(
            "accountCode", "debitAmount", "creditAmount", "debit", "credit", "partnerId", "lineNo");

    private final JournalRepository journalRepository;
    private final JournalService journalService;
    private final ObjectMapper objectMapper;
    private final JournalCollabSuggestionRepository suggestionRepository;
    private final JournalCollabCommentRepository commentRepository;

    public JournalDocumentCollaborationPort(JournalRepository journalRepository,
                                            JournalService journalService,
                                            ObjectMapper objectMapper,
                                            JournalCollabSuggestionRepository suggestionRepository,
                                            JournalCollabCommentRepository commentRepository) {
        this.journalRepository = journalRepository;
        this.journalService = journalService;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
        this.suggestionRepository = suggestionRepository;
        this.commentRepository = commentRepository;
    }

    @Override
    public CollabDocumentType documentType() {
        return CollabDocumentType.ACCOUNTING_VOUCHER;
    }

    /** 현재 회계전표 snapshot 을 JSON 문자열로 반환한다. */
    @Override
    @Transactional(readOnly = true)
    public String loadSnapshot(UUID documentId) {
        Journal journal = loadJournal(documentId);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("journalNo", journal.getJournalNo());
        snapshot.put("journalDate", journal.getJournalDate());
        snapshot.put("description", journal.getDescription());
        snapshot.put("status", journal.getStatus().name());
        snapshot.put("lines", journal.getLines().stream()
                .map(this::lineSnapshot)
                .toList());
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "회계전표 스냅샷 직렬화 실패");
        }
    }

    /**
     * path → {after} changeSet 을 회계전표 overlay patch 경로로 적용한다.
     */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        applyOverlayPatchBatch(documentId, changeSetJson, SYSTEM_ACTOR_ID, SYSTEM_ACTOR_NAME);
    }

    /**
     * 수정완료 actor 로 overlay batch 를 적용한다.
     *
     * @param documentId 분개 UUID
     * @param changeSetJson path → {before, after} JSON
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명
     * @return 변경 후 분개 상세
     */
    @Transactional
    public JournalDetailResponse applyOverlayPatchBatch(UUID documentId, String changeSetJson,
                                                        UUID actorId, String actorName) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        return journalService.applyOverlayPatchBatch(
                documentId, patches, actorId == null ? null : actorId.toString());
    }

    /**
     * changeSet JSON 의 구조와 원장 불변 정책을 수정완료 저장 전 조기 검증한다.
     *
     * @param changeSetJson 검증 대상 changeSet JSON 문자열
     * @throws BusinessException(INVALID_INPUT) JSON 형식 오류 / 구조 불량 / 원장 필드 포함 / 적용 필드 0건
     */
    public void validateChangeSet(String changeSetJson) {
        parseChangeSet(changeSetJson);
    }

    /**
     * changeSet 에 현재 회계전표의 before 값을 보강한다.
     *
     * @param documentId 분개 UUID
     * @param changeSetJson path → {after} JSON
     * @return path → {before, after} JSON
     */
    @Transactional(readOnly = true)
    public String enrichChangeSetWithBefore(UUID documentId, String changeSetJson) {
        Map<String, Object> patches = parseChangeSet(changeSetJson);
        Journal journal = loadJournal(documentId);
        com.fasterxml.jackson.databind.node.ObjectNode root = objectMapper.createObjectNode();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            com.fasterxml.jackson.databind.node.ObjectNode change = objectMapper.createObjectNode();
            String before = readOverlayField(journal, patch.getKey());
            if (before == null) {
                change.putNull("before");
            } else {
                change.put("before", before);
            }
            Object after = patch.getValue();
            if (after == null) {
                change.putNull("after");
            } else {
                change.put("after", String.valueOf(after));
            }
            root.set(patch.getKey(), change);
        }
        try {
            return objectMapper.writeValueAsString(root);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "회계전표 수정 이력 changeSet 직렬화 실패");
        }
    }

    /**
     * snapshot JSON 으로 적요/라인메모만 복원한다.
     *
     * <p>원장 금액/계정/일자/전표번호는 snapshot 에 있더라도 복원하지 않는다.
     */
    @Override
    @Transactional
    public void restoreSnapshot(UUID documentId, String snapshotJson) {
        JsonNode root = parseObject(snapshotJson, "snapshot");
        Map<String, Object> patches = new LinkedHashMap<>();
        if (root.has("description")) {
            patches.put("description", toNullableText(root.get("description")));
        }
        JsonNode lines = root.get("lines");
        if (lines != null && lines.isArray()) {
            for (JsonNode line : lines) {
                JsonNode lineNo = line.get("lineNo");
                if (lineNo != null && lineNo.canConvertToInt() && line.has("memo")) {
                    patches.put("line." + lineNo.asInt() + ".memo", toNullableText(line.get("memo")));
                }
            }
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "회계전표 스냅샷에 복원할 overlay 필드가 없습니다");
        }
        journalService.applyOverlayPatchBatch(documentId, patches, SYSTEM_ACTOR_ID.toString());
    }

    /**
     * 제안 가능 여부를 판정한다. 실제 권한은 컨트롤러 {@code @RequirePermission} 이 담당한다.
     */
    @Override
    public boolean canPropose(UUID userId, UUID documentId) {
        return userId != null && !SYSTEM_ACTOR_ID.equals(userId);
    }

    /**
     * 수락/거절 가능 여부를 판정한다. 실제 권한은 컨트롤러 {@code @RequirePermission} 이 담당한다.
     */
    @Override
    public boolean canDecide(UUID userId, UUID documentId) {
        return canPropose(userId, documentId);
    }

    /**
     * 회계전표 수정완료 알림 수신자를 해석한다.
     *
     * <p>결재자 개념이 없으므로 createdBy, postedBy, 수정 이력 proposer/decider, 댓글 author 만
     * distinct 로 합산하고 현재 수정자는 제외한다.
     */
    @Override
    @Transactional(readOnly = true)
    public Set<String> resolveNotificationRecipients(UUID documentId, UUID excludeUserId) {
        Journal journal = loadJournal(documentId);
        Set<String> recipients = new LinkedHashSet<>();
        addRecipient(recipients, journal.getCreatedBy(), excludeUserId);
        addRecipient(recipients, journal.getPostedBy(), excludeUserId);
        if (suggestionRepository != null) {
            suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                    .forEach(suggestion -> {
                        addRecipient(recipients, suggestion.getProposerId().toString(), excludeUserId);
                        addRecipient(recipients,
                                suggestion.getDecidedById() == null ? null : suggestion.getDecidedById().toString(),
                                excludeUserId);
                    });
        }
        if (commentRepository != null) {
            commentRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType(), documentId)
                    .forEach(comment -> addRecipient(recipients, comment.getAuthorId().toString(), excludeUserId));
        }
        return recipients;
    }

    private Map<String, Object> lineSnapshot(JournalLine line) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("lineNo", line.getLineNo());
        snapshot.put("accountCode", line.getAccountCode());
        snapshot.put("debit", line.getDebitAmount());
        snapshot.put("credit", line.getCreditAmount());
        snapshot.put("memo", line.getMemo());
        return snapshot;
    }

    private Map<String, Object> parseChangeSet(String changeSetJson) {
        JsonNode root = parseObject(changeSetJson, "changeSet");
        Map<String, Object> patches = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String fieldName = normalizeAndValidatePath(entry.getKey());
            JsonNode change = entry.getValue();
            if (change == null || !change.isObject() || !change.has("after")) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "changeSet entry 는 after 필드를 가진 JSON object 여야 합니다: " + entry.getKey());
            }
            patches.put(fieldName, toNullableText(change.get("after")));
        }
        if (patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet 에 적용할 필드가 없습니다");
        }
        return patches;
    }

    private String normalizeAndValidatePath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet path 는 필수입니다");
        }
        String normalized = rawPath.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        normalized = normalized.replace("/", ".");
        if ("description".equals(normalized)) {
            return normalized;
        }
        Matcher matcher = LINE_MEMO_PATH.matcher(normalized);
        if (matcher.matches()) {
            int lineNo = Integer.parseInt(matcher.group(1));
            if (lineNo < 1) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "lineNo 는 1 이상이어야 합니다: " + rawPath);
            }
            return normalized;
        }
        rejectLedgerPath(normalized);
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "회계전표 협업은 description 과 line.{lineNo}.memo 만 수정할 수 있습니다: " + rawPath);
    }

    private void rejectLedgerPath(String normalized) {
        if (LEDGER_HEADER_FIELDS.contains(normalized)) {
            throw ledgerFieldException(normalized);
        }
        if (normalized.startsWith("line.")) {
            String[] parts = normalized.split("\\.");
            String field = parts.length >= 3 ? parts[2] : normalized;
            if (LEDGER_LINE_FIELDS.contains(field)) {
                throw ledgerFieldException(normalized);
            }
        }
    }

    private BusinessException ledgerFieldException(String path) {
        return new BusinessException(ErrorCode.INVALID_INPUT,
                "원장 필드는 협업 수정완료로 변경할 수 없습니다: " + path);
    }

    private String readOverlayField(Journal journal, String fieldName) {
        if ("description".equals(fieldName)) {
            return journal.getDescription();
        }
        Matcher matcher = LINE_MEMO_PATH.matcher(fieldName);
        if (matcher.matches()) {
            int lineNo = Integer.parseInt(matcher.group(1));
            return journal.requireLineByLineNo(lineNo).getMemo();
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "지원하지 않는 회계전표 overlay 필드입니다: " + fieldName);
    }

    private Journal loadJournal(UUID documentId) {
        return journalRepository.findById(documentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "회계전표를 찾을 수 없습니다"));
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
}
