package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.AccountingSettlementApprovalClaimClient;
import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.groupware.domain.ApprovalAttachment;
import com.samhanair.logis.groupware.domain.ApprovalAttachmentType;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalReferenceDocType;
import com.samhanair.logis.groupware.dto.ApprovalAttachmentRequest;
import com.samhanair.logis.groupware.dto.ApprovalReferenceLookupResponse;
import com.samhanair.logis.groupware.policy.SettlementApprovalReferencePolicy;
import com.samhanair.logis.groupware.repository.ApprovalAttachmentRepository;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.storage.ApprovalAttachmentStorage;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/**
 * 결재 첨부 라이프사이클 서비스.
 *
 * <p>참조 첨부는 DB 메타데이터만 저장하고, 파일 첨부는 storage 업로드 후 DB metadata 를 저장한다.
 * APPROVED/REJECTED/WITHDRAWN 결재는 {@link ApprovalLine#guardCollabModifiable()} 로 변경을 막는다.
 */
@Service
public class ApprovalAttachmentService {

    /** 단일 파일 최대 크기. */
    public static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024;

    /** 허용 MIME. */
    public static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/jpg",
            "image/png",
            "application/pdf"
    );

    private static final String STORAGE_KEY_PREFIX = "groupware-approval-attachments";

    private final ApprovalLineRepository approvalLineRepository;
    private final ApprovalAttachmentRepository attachmentRepository;
    private final ApprovalAttachmentStorage storage;
    private final AccountingSettlementApprovalClaimClient claimClient;

    @Autowired
    public ApprovalAttachmentService(ApprovalLineRepository approvalLineRepository,
                                     ApprovalAttachmentRepository attachmentRepository,
                                     ApprovalAttachmentStorage storage,
                                     AccountingSettlementApprovalClaimClient claimClient) {
        this.approvalLineRepository = approvalLineRepository;
        this.attachmentRepository = attachmentRepository;
        this.storage = storage;
        this.claimClient = claimClient;
    }

    /** 기존 비정산 첨부 단위 테스트와 호환되는 생성 경계. 정산 첨부는 fail-closed 처리한다. */
    public ApprovalAttachmentService(ApprovalLineRepository approvalLineRepository,
                                     ApprovalAttachmentRepository attachmentRepository,
                                     ApprovalAttachmentStorage storage) {
        this(approvalLineRepository, attachmentRepository, storage, null);
    }

    /** 결재 참조 첨부를 추가한다. */
    @Transactional(timeout = SettlementApprovalReferencePolicy.TRANSACTION_TIMEOUT_SECONDS)
    public ApprovalAttachment addReference(UUID approvalId, ApprovalAttachmentRequest request) {
        ApprovalLine approval = loadApproval(approvalId);
        return addReferenceForApproval(approval, approvalId, request,
                SettlementApprovalReferencePolicy.deadlineNanos());
    }

    /** 결재 생성 transaction 안에서 참조 첨부와 결재 row를 함께 저장한다. */
    public void addReferencesAtomically(ApprovalLine approval, List<ApprovalAttachmentRequest> requests) {
        addReferencesAtomically(approval, requests, SettlementApprovalReferencePolicy.deadlineNanos());
    }

    /** 결재 생성 transaction의 deadline을 공유하며 참조 첨부와 결재 row를 함께 저장한다. */
    public void addReferencesAtomically(ApprovalLine approval, List<ApprovalAttachmentRequest> requests,
                                        long deadlineNanos) {
        if (requests == null || requests.isEmpty()) {
            return;
        }
        SettlementApprovalReferencePolicy.validateAtomicReferenceCount(requests.size());
        approval.guardCollabModifiable();
        for (ApprovalAttachmentRequest request : requests) {
            SettlementApprovalReferencePolicy.ensureWithinDeadline(deadlineNanos);
            addReferenceForApproval(approval, approval.getId(), request, deadlineNanos);
        }
    }

    private ApprovalAttachment addReferenceForApproval(
            ApprovalLine approval, UUID approvalId, ApprovalAttachmentRequest request,
            long deadlineNanos) {
        SettlementApprovalReferencePolicy.ensureWithinDeadline(deadlineNanos);
        approval.guardCollabModifiable();
        ApprovalAttachment attachment;
        if (request.refDocType() != null) {
            attachment = addUnifiedDocumentReference(approval, request);
        } else if (request.attachmentType() == ApprovalAttachmentType.SLIP_REF) {
            attachment = ApprovalAttachment.slipRef(approval, labelOrDefault(request.label(), "전표 참조"),
                    request.displayOrder(), request.refSlipNo(), request.refSlipType());
        } else if (request.attachmentType() == ApprovalAttachmentType.PARTNER_LEDGER_REF) {
            attachment = ApprovalAttachment.partnerLedgerRef(approval, labelOrDefault(request.label(), "거래처 원장"),
                    request.displayOrder(), request.refPartnerCode(), request.refPartnerName(), request.refPeriod());
        } else {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "참조 첨부 endpoint 에서는 FILE 을 사용할 수 없습니다");
        }
        if (request.refDocType() != ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT) {
            ApprovalAttachment saved = attachmentRepository.save(attachment);
            SettlementApprovalReferencePolicy.ensureWithinDeadline(deadlineNanos);
            return saved;
        }
        String documentNo = attachment.getRefDocNo();
        if (claimClient == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "accounting settlement claim client가 구성되지 않았습니다");
        }
        SettlementApprovalReferencePolicy.ensureClaimCallFits(deadlineNanos);
        UUID claimToken = reserveClaim(documentNo, approvalId);
        registerRollbackCompensation(claimToken);
        try {
            SettlementApprovalReferencePolicy.ensureWithinDeadline(deadlineNanos);
            ApprovalAttachment saved = attachmentRepository.save(attachment);
            // 로컬 row가 현재 transaction에 준비된 뒤 accounting claim을 ACTIVE로 승격한다.
            SettlementApprovalReferencePolicy.ensureClaimCallFits(deadlineNanos);
            claimClient.activate(claimToken);
            SettlementApprovalReferencePolicy.ensureWithinDeadline(deadlineNanos);
            return saved;
        } catch (RuntimeException ex) {
            releaseQuietly(claimToken);
            throw ex;
        }
    }

    private ApprovalAttachment addUnifiedDocumentReference(ApprovalLine approval, ApprovalAttachmentRequest request) {
        ApprovalReferenceDocType docType = request.refDocType();
        if (docType == ApprovalReferenceDocType.PARTNER_LEDGER) {
            return ApprovalAttachment.partnerLedgerRef(approval, labelOrDefault(request.label(), "거래처 원장"),
                    request.displayOrder(), request.refPartnerCode(), request.refPartnerName(), request.refPeriod());
        }
        String defaultLabel = switch (docType) {
            case OUTBOUND_SLIP -> "출고전표";
            case INBOUND_SLIP -> "입고전표";
            case JOURNAL -> "분개장";
            case TAX_INVOICE -> "세금계산서";
            case STATEMENT -> "거래명세서";
            case PARTNER_LEDGER -> "거래처 원장";
            case SALES_COMMISSION_SETTLEMENT -> "영업수수료 정산서";
        };
        String refDocNo = request.refDocNo() == null || request.refDocNo().isBlank()
                ? request.refSlipNo()
                : request.refDocNo();
        return ApprovalAttachment.documentRef(approval, labelOrDefault(request.label(), defaultLabel),
                request.displayOrder(), docType, refDocNo, request.refDocLabel());
    }

    /** 결재 파일 첨부를 업로드한다. */
    @Transactional
    public ApprovalAttachment uploadFile(UUID approvalId, MultipartFile file, String label, int displayOrder) {
        validateFile(file);
        ApprovalLine approval = loadApproval(approvalId);
        approval.guardCollabModifiable();
        String fileName = sanitizeFileName(file.getOriginalFilename());
        String storageKey = buildStorageKey(approvalId, fileName);
        try (InputStream in = file.getInputStream()) {
            storage.put(storageKey, file.getContentType(), file.getSize(), in);
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "결재 첨부 업로드 실패: " + ex.getMessage());
        }
        ApprovalAttachment attachment = ApprovalAttachment.file(approval, labelOrDefault(label, fileName),
                displayOrder, storageKey, fileName, file.getContentType(), file.getSize());
        return attachmentRepository.save(attachment);
    }

    /** 결재별 첨부 목록 조회. */
    @Transactional(readOnly = true)
    public List<ApprovalAttachment> list(UUID approvalId) {
        if (!approvalLineRepository.existsById(approvalId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "결재 문서를 찾을 수 없습니다: " + approvalId);
        }
        return attachmentRepository.findAllByApprovalIdOrderByDisplayOrderAscCreatedAtAsc(approvalId);
    }

    /** 업무문서 유형·번호로 연결된 활성 결재 목록과 상태를 역방향 조회한다. */
    @Transactional(readOnly = true)
    public List<ApprovalReferenceLookupResponse> listByReference(
            ApprovalReferenceDocType refDocType, String refDocNo) {
        if (refDocType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "참조 문서 유형은 필수입니다");
        }
        if (refDocNo == null || refDocNo.isBlank() || refDocNo.trim().length() > 40) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "참조 문서 번호는 1~40자 필수입니다");
        }
        Map<java.util.UUID, ApprovalReferenceLookupResponse> uniqueApprovals = new LinkedHashMap<>();
        attachmentRepository.findAllByReference(refDocType, refDocNo.trim())
                .forEach(attachment -> uniqueApprovals.putIfAbsent(
                        attachment.getApproval().getId(),
                        ApprovalReferenceLookupResponse.from(attachment.getApproval())));
        return List.copyOf(uniqueApprovals.values());
    }

    /** 정산서 확정 취소를 막아야 하는 활성 결재가 있는지 조회한다. */
    @Transactional(readOnly = true)
    public boolean hasActiveSettlementApproval(String documentNo) {
        if (documentNo == null || documentNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "documentNo 는 필수입니다");
        }
        return attachmentRepository.existsByRefDocTypeAndRefDocNoAndApproval_StatusIn(
                ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT,
                documentNo.trim(),
                Set.of(ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS, ApprovalStatus.APPROVED));
    }

    /**
     * 결재가 종료되어 더 이상 정산서를 참조하지 않게 된 뒤 claim을 commit 후 해제한다.
     *
     * <p>상태별 호출자가 claim 수명을 따로 관리하지 않도록 결재 ID를 기준으로 활성 정산 참조를
     * 다시 수집한다. 따라서 REJECTED/WITHDRAWN 외에 종료 전이 경로가 추가되어도 같은 경계를
     * 재사용할 수 있고, 동일 문서의 중복 첨부는 accounting release를 한 번만 호출한다.
     * rollback 중에는 callback이 실행되지 않아 claim이 결재보다 먼저 풀리지 않는다.
     */
    public void releaseSettlementClaimsAfterApprovalCompletion(UUID approvalId) {
        if (approvalId == null || claimClient == null) {
            return;
        }
        Set<String> documentNumbers = new LinkedHashSet<>();
        attachmentRepository.findAllByApprovalIdOrderByDisplayOrderAscCreatedAtAsc(approvalId).stream()
                .filter(attachment -> attachment.getRefDocType()
                        == ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT)
                .map(ApprovalAttachment::getRefDocNo)
                .filter(documentNo -> documentNo != null && !documentNo.isBlank())
                .map(String::trim)
                .forEach(documentNumbers::add);
        documentNumbers.forEach(documentNo -> registerReleaseAfterCommit(approvalId, documentNo));
    }

    /** 첨부 파일 다운로드 객체 조회. */
    @Transactional(readOnly = true)
    public DownloadView download(UUID approvalId, UUID attachmentId) {
        ApprovalAttachment attachment = loadAttachmentForApproval(approvalId, attachmentId);
        if (attachment.getAttachmentType() != ApprovalAttachmentType.FILE) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파일 첨부만 다운로드할 수 있습니다");
        }
        return new DownloadView(attachment, storage.get(attachment.getStorageKey()));
    }

    /** 첨부 soft-delete. FILE 은 storage 객체도 best-effort 삭제한다. */
    @Transactional
    public void delete(UUID approvalId, UUID attachmentId, String actor) {
        ApprovalLine approval = loadApproval(approvalId);
        approval.guardCollabModifiable();
        ApprovalAttachment attachment = loadAttachmentForApproval(approvalId, attachmentId);
        attachment.softDelete(actor);
        if (attachment.getRefDocType() == ApprovalReferenceDocType.SALES_COMMISSION_SETTLEMENT
                && claimClient != null
                && !attachmentRepository.existsOtherActiveReference(
                        approvalId, attachment.getRefDocType(), attachment.getRefDocNo(), attachmentId)) {
            registerReleaseAfterCommit(approvalId, attachment.getRefDocNo());
        }
        if (attachment.getAttachmentType() == ApprovalAttachmentType.FILE) {
            storage.delete(attachment.getStorageKey());
        }
    }

    /** 다운로드 view. */
    public record DownloadView(ApprovalAttachment attachment, ApprovalAttachmentStorage.StoredObject storedObject) {
    }

    private ApprovalLine loadApproval(UUID approvalId) {
        return approvalLineRepository.findFlatById(approvalId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 문서를 찾을 수 없습니다: " + approvalId));
    }

    private ApprovalAttachment loadAttachmentForApproval(UUID approvalId, UUID attachmentId) {
        ApprovalAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재 첨부를 찾을 수 없습니다: " + attachmentId));
        if (!approvalId.equals(attachment.getApproval().getId())) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "결재 첨부를 찾을 수 없습니다: " + attachmentId);
        }
        return attachment;
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파일이 비어 있습니다");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파일 크기는 최대 10MB 까지 허용됩니다");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "허용되지 않은 파일 형식입니다. 허용: " + ALLOWED_CONTENT_TYPES);
        }
    }

    private String labelOrDefault(String label, String fallback) {
        return label == null || label.isBlank() ? fallback : label;
    }

    private String sanitizeFileName(String original) {
        if (original == null || original.isBlank()) {
            return "untitled";
        }
        return original.replace("/", "_").replace("\\", "_");
    }

    private String buildStorageKey(UUID approvalId, String fileName) {
        return STORAGE_KEY_PREFIX + "/" + approvalId + "/" + UUID.randomUUID() + extractExtension(fileName);
    }

    private String extractExtension(String fileName) {
        int idx = fileName.lastIndexOf('.');
        if (idx < 0 || idx == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(idx).toLowerCase();
    }

    private void registerRollbackCompensation(UUID claimToken) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    releaseQuietly(claimToken);
                }
            }
        });
    }

    /** 삭제 transaction이 실제 commit된 뒤에만 보호 claim을 해제한다. */
    private void registerReleaseAfterCommit(UUID approvalId, String documentNo) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            releaseReferenceQuietly(approvalId, documentNo);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) {
                    releaseReferenceQuietly(approvalId, documentNo);
                }
            }
        });
    }

    private void releaseReferenceQuietly(UUID approvalId, String documentNo) {
        try {
            claimClient.releaseByApprovalReference(approvalId, documentNo);
        } catch (RuntimeException ignored) {
            // 삭제는 정상 처리하고 accounting claim의 expires_at 자가 치유에 맡긴다.
        }
    }

    private void releaseQuietly(UUID claimToken) {
        try {
            claimClient.release(claimToken);
        } catch (RuntimeException ignored) {
            // accounting claim의 expires_at이 유실된 보상 호출을 자가 치유한다.
        }
    }

    private UUID reserveClaim(String documentNo, UUID approvalId) {
        try {
            return claimClient.reserve(documentNo, approvalId);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "정산 참조 확인에 실패했습니다. 회계 서비스가 정상화된 뒤 다시 시도해 주세요", ex);
        }
    }
}
