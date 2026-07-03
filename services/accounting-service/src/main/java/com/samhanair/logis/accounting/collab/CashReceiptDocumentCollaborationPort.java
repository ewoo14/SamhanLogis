package com.samhanair.logis.accounting.collab;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.service.CashReceiptService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 입금보고서 협업 포트. DRAFT 상태에서만 changeSet 적용이 가능하다. */
@Component
public class CashReceiptDocumentCollaborationPort implements DocumentCollaborationPort {

    private static final Set<String> SUPPORTED_FIELDS = Set.of(
            "partnerId", "amount", "transactionDate", "memo",
            "debitAccountCode", "creditAccountCode");

    private final CashReceiptRepository repository;
    private final CashReceiptService service;
    private final ObjectMapper objectMapper;

    public CashReceiptDocumentCollaborationPort(CashReceiptRepository repository,
                                                CashReceiptService service,
                                                ObjectMapper objectMapper) {
        this.repository = repository;
        this.service = service;
        this.objectMapper = objectMapper.copy()
                .findAndRegisterModules()
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    @Override
    public CollabDocumentType documentType() {
        return CollabDocumentType.ACCOUNTING_CASH_RECEIPT;
    }

    /** 현재 입금보고서 snapshot JSON. */
    @Override
    @Transactional(readOnly = true)
    public String loadSnapshot(UUID documentId) {
        CashReceipt receipt = load(documentId);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("slipNo", receipt.getSlipNo());
        snapshot.put("partnerId", receipt.getPartnerId());
        snapshot.put("amount", receipt.getAmount());
        snapshot.put("transactionDate", receipt.getTransactionDate());
        snapshot.put("kind", receipt.getKind().name());
        snapshot.put("status", receipt.getStatus().name());
        snapshot.put("memo", receipt.getMemo());
        snapshot.put("debitAccountCode", receipt.getDebitAccountCode());
        snapshot.put("creditAccountCode", receipt.getCreditAccountCode());
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "입금보고서 스냅샷 직렬화 실패");
        }
    }

    /** changeSet 적용. 상태 가드는 CashReceiptService/updateDraft 도메인 메서드가 수행한다. */
    @Override
    @Transactional
    public void applyChangeSet(UUID documentId, String changeSetJson) {
        Map<String, Object> patches = service.parseChangeSet(changeSetJson);
        validateFields(patches);
        service.applyOverlayPatchBatch(documentId, patches);
    }

    /** snapshot JSON 복원. 수기 편집 가능 필드만 복원한다. */
    @Override
    @Transactional
    public void restoreSnapshot(UUID documentId, String snapshotJson) {
        Map<String, Object> patches = service.parseChangeSet(toChangeSet(snapshotJson));
        validateFields(patches);
        service.applyOverlayPatchBatch(documentId, patches);
    }

    /**
     * 입금보고서 협업 제안 가능 여부.
     *
     * <p>S1에서는 결재선/RBAC 상세 연동 전이므로 인증된 사용자 UUID 존재 여부만 확인한다.
     */
    @Override
    public boolean canPropose(UUID userId, UUID documentId) {
        return userId != null;
    }

    /**
     * 입금보고서 협업 제안 결정 가능 여부.
     *
     * <p>S1에서는 결재선/RBAC 상세 연동 전이므로 인증된 사용자 UUID 존재 여부만 확인한다.
     */
    @Override
    public boolean canDecide(UUID userId, UUID documentId) {
        return userId != null;
    }

    private CashReceipt load(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "입금보고서를 찾을 수 없습니다"));
    }

    private void validateFields(Map<String, Object> patches) {
        for (String field : patches.keySet()) {
            if (!SUPPORTED_FIELDS.contains(field)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "입금보고서 협업 수정 필드가 아닙니다: " + field);
            }
        }
    }

    private String toChangeSet(String snapshotJson) {
        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(snapshotJson);
            if (!root.isObject()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "snapshot 은 JSON object 여야 합니다");
            }
            com.fasterxml.jackson.databind.node.ObjectNode changeSet = objectMapper.createObjectNode();
            for (String field : SUPPORTED_FIELDS) {
                if (root.has(field)) {
                    com.fasterxml.jackson.databind.node.ObjectNode change = objectMapper.createObjectNode();
                    change.set("after", root.get(field));
                    changeSet.set(field, change);
                }
            }
            return objectMapper.writeValueAsString(changeSet);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "snapshot JSON 형식이 올바르지 않습니다");
        }
    }
}
