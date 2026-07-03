package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CashReceiptRequest;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse.PartnerDisplay;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 입금보고서 수기 CRUD와 상태 라이프사이클 service. */
@Service
@RequiredArgsConstructor
@Transactional
public class CashReceiptService {

    private final CashReceiptRepository repository;
    private final JournalRepository journalRepository;
    private final CashReceiptNumberService numberService;
    private final AccountService accountService;
    private final PartnerLookupClient partnerLookupClient;
    private final ObjectMapper objectMapper;

    /** 수기 입금보고서 생성. S1에서는 journalId 를 비운다. */
    public CashReceiptResponse createManual(CashReceiptRequest request) {
        PartnerSummary partner = resolvePartner(request);
        validateAccounts(request.debitAccountCode(), request.creditAccountCode());
        String slipNo = numberService.next(request.transactionDate());
        CashReceipt receipt = CashReceipt.createManual(
                slipNo,
                partner.partnerId(),
                request.amount(),
                request.transactionDate(),
                request.memo(),
                request.debitAccountCode(),
                request.creditAccountCode());
        return responseOf(repository.save(receipt));
    }

    /** 입금보고서 목록 조회. */
    @Transactional(readOnly = true)
    public Page<CashReceiptResponse> list(String partnerCode, String bizNo, String partnerName,
                                          LocalDate from, LocalDate to,
                                          CashReceiptStatus status, CashReceiptKind kind,
                                          Pageable pageable) {
        PartnerSummary filterPartner = hasText(partnerCode) || hasText(bizNo) || hasText(partnerName)
                ? resolvePartner(partnerCode, bizNo, partnerName)
                : null;
        UUID partnerId = filterPartner == null ? null : filterPartner.partnerId();
        Page<CashReceipt> page = repository.findAll(spec(partnerId, from, to, status, kind), pageable);
        Map<UUID, PartnerSummary> partners = resolveDisplays(page.getContent());
        Map<UUID, String> journalNos = resolveJournalNos(page.getContent());
        return page.map(receipt -> CashReceiptResponse.of(
                receipt,
                displayOf(partners.get(receipt.getPartnerId())),
                journalNoOf(receipt, journalNos)));
    }

    /** 단건 조회. */
    @Transactional(readOnly = true)
    public CashReceiptResponse getOne(String slipNo) {
        return responseOf(findBySlipNoOrThrow(slipNo));
    }

    /** DRAFT 입금보고서 수정. */
    public CashReceiptResponse updateDraft(String slipNo, CashReceiptRequest request) {
        CashReceipt receipt = findBySlipNoOrThrow(slipNo);
        return updateDraft(receipt, request);
    }

    private CashReceiptResponse updateDraft(CashReceipt receipt, CashReceiptRequest request) {
        receipt.requireDraft("입금보고서 수정은 DRAFT 단계에서만 허용됩니다");
        PartnerSummary partner = resolvePartner(request);
        return updateDraft(receipt, new CashReceiptDraftCommand(
                partner.partnerId(),
                request.amount(),
                request.transactionDate(),
                request.memo(),
                request.debitAccountCode(),
                request.creditAccountCode()));
    }

    private CashReceiptResponse updateDraft(CashReceipt receipt, CashReceiptDraftCommand command) {
        receipt.requireDraft("입금보고서 수정은 DRAFT 단계에서만 허용됩니다");
        validateAccounts(command.debitAccountCode(), command.creditAccountCode());
        receipt.updateDraft(
                command.amount(),
                command.transactionDate(),
                command.memo(),
                command.partnerId(),
                command.debitAccountCode(),
                command.creditAccountCode());
        return responseOf(receipt);
    }

    /** DRAFT → CONFIRMED. 분개 생성은 S2 범위다. */
    public CashReceiptResponse confirm(String slipNo) {
        CashReceipt receipt = findBySlipNoOrThrow(slipNo);
        receipt.confirm();
        return responseOf(receipt);
    }

    /** CONFIRMED → CANCELLED. 역분개는 S2 범위다. */
    public CashReceiptResponse cancel(String slipNo) {
        CashReceipt receipt = findBySlipNoOrThrow(slipNo);
        receipt.cancel();
        return responseOf(receipt);
    }

    /** DRAFT 입금보고서 soft-delete. */
    public void deleteDraft(String slipNo, String actor) {
        findBySlipNoOrThrow(slipNo).softDeleteDraft(actor);
    }

    /** 협업 수정완료 changeSet 을 DRAFT 입금보고서에 적용한다. */
    public CashReceiptResponse applyOverlayPatchBatch(UUID id, Map<String, Object> patches) {
        if (patches == null || patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "적용할 입금보고서 변경 내역이 없습니다");
        }
        CashReceipt current = findOrThrow(id);
        CashReceiptDraftCommand merged = merge(current, patches);
        return updateDraft(current, merged);
    }

    /** 협업 changeSet JSON 을 path map 으로 파싱한다. */
    public Map<String, Object> parseChangeSet(String changeSetJson) {
        if (changeSetJson == null || changeSetJson.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet 은 필수입니다");
        }
        try {
            JsonNode root = objectMapper.readTree(changeSetJson);
            if (!root.isObject()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet 은 JSON object 여야 합니다");
            }
            Map<String, Object> patches = new LinkedHashMap<>();
            root.fields().forEachRemaining(entry -> {
                JsonNode value = entry.getValue();
                if (value == null || !value.isObject() || !value.has("after")) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "changeSet entry 는 after 필드를 가진 JSON object 여야 합니다: " + entry.getKey());
                }
                patches.put(entry.getKey(), toNullableText(value.get("after")));
            });
            return patches;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet JSON 형식이 올바르지 않습니다");
        }
    }

    private CashReceiptDraftCommand merge(CashReceipt current, Map<String, Object> patches) {
        UUID partnerId = current.getPartnerId();
        java.math.BigDecimal amount = current.getAmount();
        LocalDate transactionDate = current.getTransactionDate();
        String memo = current.getMemo();
        String debitAccountCode = current.getDebitAccountCode();
        String creditAccountCode = current.getCreditAccountCode();
        for (Map.Entry<String, Object> patch : patches.entrySet()) {
            String path = normalizePatchPath(patch.getKey());
            Object after = patch.getValue();
            switch (path) {
                case "partnerCode" -> partnerId = resolvePartner(String.valueOf(after), null, null).partnerId();
                case "bizNo" -> partnerId = resolvePartner(null, String.valueOf(after), null).partnerId();
                case "partnerName" -> partnerId = resolvePartner(null, null, String.valueOf(after)).partnerId();
                case "amount" -> amount = new java.math.BigDecimal(String.valueOf(after));
                case "transactionDate" -> transactionDate = LocalDate.parse(String.valueOf(after));
                case "memo" -> memo = after == null ? null : String.valueOf(after);
                case "debitAccountCode" -> debitAccountCode = after == null ? null : String.valueOf(after);
                case "creditAccountCode" -> creditAccountCode = after == null ? null : String.valueOf(after);
                default -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "지원하지 않는 입금보고서 변경 필드입니다: " + path);
            }
        }
        return new CashReceiptDraftCommand(partnerId, amount, transactionDate, memo,
                debitAccountCode, creditAccountCode);
    }

    private String normalizePatchPath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "changeSet path 는 필수입니다");
        }
        String normalized = rawPath.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized.replace("/", ".");
    }

    private void validateAccounts(String debitAccountCode, String creditAccountCode) {
        accountService.requireLeafAccount(debitAccountCode == null || debitAccountCode.isBlank()
                ? CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE : debitAccountCode);
        accountService.requireLeafAccount(creditAccountCode == null || creditAccountCode.isBlank()
                ? CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE : creditAccountCode);
    }

    private Specification<CashReceipt> spec(UUID partnerId, LocalDate from, LocalDate to,
                                            CashReceiptStatus status, CashReceiptKind kind) {
        return (root, query, cb) -> {
            java.util.List<jakarta.persistence.criteria.Predicate> predicates =
                    new java.util.ArrayList<>();
            if (partnerId != null) {
                predicates.add(cb.equal(root.get("partnerId"), partnerId));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("transactionDate"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("transactionDate"), to));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (kind != null) {
                predicates.add(cb.equal(root.get("kind"), kind));
            }
            if (query != null) {
                query.orderBy(cb.desc(root.get("transactionDate")), cb.desc(root.get("slipNo")));
            }
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    private CashReceipt findOrThrow(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "입금보고서를 찾을 수 없습니다"));
    }

    private CashReceipt findBySlipNoOrThrow(String slipNo) {
        if (!hasText(slipNo)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "slipNo 는 필수입니다");
        }
        return repository.findBySlipNo(slipNo.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "입금보고서를 찾을 수 없습니다: " + slipNo));
    }

    private PartnerSummary resolvePartner(CashReceiptRequest request) {
        return resolvePartner(request.partnerCode(), request.bizNo(), request.partnerName());
    }

    private PartnerSummary resolvePartner(String partnerCode, String bizNo, String partnerName) {
        if (hasText(partnerCode)) {
            return partnerLookupClient.findByPartnerCode(partnerCode.trim())
                    .filter(p -> p.partnerId() != null)
                    .orElseThrow(() -> new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                            "거래처코드로 거래처를 찾을 수 없습니다: " + partnerCode));
        }
        if (hasText(bizNo)) {
            return resolveByDirectorySingle(bizNo.trim(), "사업자번호");
        }
        if (hasText(partnerName)) {
            return partnerLookupClient.findByPartnerName(partnerName.trim())
                    .filter(p -> p.partnerId() != null)
                    .orElseThrow(() -> new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                            "거래처명으로 거래처를 찾을 수 없습니다: " + partnerName));
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "partnerCode, bizNo, partnerName 중 하나는 필수입니다");
    }

    private PartnerSummary resolveByDirectorySingle(String query, String label) {
        List<PartnerSummary> matches = partnerLookupClient.searchDirectory(query, 2);
        if (matches.isEmpty()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + "로 거래처를 찾을 수 없습니다: " + query);
        }
        if (matches.size() > 1) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + " 조회 결과가 2건 이상입니다. 거래처코드로 다시 선택하세요: " + query);
        }
        PartnerSummary partner = matches.get(0);
        if (partner.partnerId() == null) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + " 조회 결과에 내부 거래처 ID가 없습니다: " + query);
        }
        return partner;
    }

    private CashReceiptResponse responseOf(CashReceipt receipt) {
        Map<UUID, PartnerSummary> partners = resolveDisplays(List.of(receipt));
        Map<UUID, String> journalNos = resolveJournalNos(List.of(receipt));
        return CashReceiptResponse.of(
                receipt,
                displayOf(partners.get(receipt.getPartnerId())),
                journalNoOf(receipt, journalNos));
    }

    private Map<UUID, PartnerSummary> resolveDisplays(List<CashReceipt> receipts) {
        List<UUID> ids = receipts.stream()
                .map(CashReceipt::getPartnerId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved = partnerLookupClient.findByPartnerIdsBatch(ids);
        if (resolved == null || resolved.isEmpty()) {
            return Map.of();
        }
        return resolved.values().stream()
                .filter(p -> p.partnerId() != null)
                .collect(Collectors.toMap(
                        PartnerSummary::partnerId,
                        Function.identity(),
                        (left, right) -> left,
                        LinkedHashMap::new));
    }

    private Map<UUID, String> resolveJournalNos(List<CashReceipt> receipts) {
        List<UUID> ids = receipts.stream()
                .map(CashReceipt::getJournalId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return journalRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(
                        journal -> journal.getId(),
                        journal -> journal.getJournalNo(),
                        (left, right) -> left,
                        LinkedHashMap::new));
    }

    private static String journalNoOf(CashReceipt receipt, Map<UUID, String> journalNos) {
        return receipt.getJournalId() == null ? null : journalNos.get(receipt.getJournalId());
    }

    private static PartnerDisplay displayOf(PartnerSummary partner) {
        if (partner == null) {
            return new PartnerDisplay("미등록", "", "(미조회)");
        }
        return new PartnerDisplay(
                valueOrDefault(partner.partnerCode(), "미등록"),
                digitsOnly(partner.bizNo()),
                valueOrDefault(partner.name(), "(미조회)"));
    }

    private static String valueOrDefault(String value, String fallback) {
        return value != null && !value.isBlank() ? value.trim() : fallback;
    }

    private static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String toNullableText(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return node.isValueNode() ? node.asText() : node.toString();
    }

    private record CashReceiptDraftCommand(
            UUID partnerId,
            java.math.BigDecimal amount,
            LocalDate transactionDate,
            String memo,
            String debitAccountCode,
            String creditAccountCode) {
    }
}
