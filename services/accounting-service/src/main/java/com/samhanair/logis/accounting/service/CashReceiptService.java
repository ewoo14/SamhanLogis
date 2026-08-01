package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CashReceiptRequest;
import com.samhanair.logis.accounting.web.dto.CashReceiptLineRequest;
import com.samhanair.logis.accounting.web.dto.CashReceiptLineResponse;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse.PartnerDisplay;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** 입금보고서 수기 CRUD + 통장연계(BANK_LINKED) 생성 초안과 상태 라이프사이클 service. */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class CashReceiptService {

    private final CashReceiptRepository repository;
    private final BankTransactionRepository bankTransactionRepository;
    private final JournalRepository journalRepository;
    private final CashReceiptNumberService numberService;
    private final AccountService accountService;
    private final PartnerLookupClient partnerLookupClient;
    private final JournalService journalService;
    private final MonthEndCloseService monthEndCloseService;
    private final Mig9AgingSnapshotRefreshService agingSnapshotRefreshService;
    private final ObjectMapper objectMapper;

    /** 수기 입금보고서 생성. S1에서는 journalId 를 비운다. */
    public CashReceiptResponse createManual(CashReceiptRequest request) {
        PartnerSummary partner = resolveHeaderPartner(request);
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
        applyLines(receipt, request);
        return responseOf(repository.save(receipt));
    }

    /** 통장연계 입금보고서 DRAFT 를 생성한다. 호출자는 즉시 {@link #confirm(UUID, String)} 로 확정한다. */
    public CashReceipt createBankLinkedDraft(UUID partnerId, BigDecimal amount, LocalDate transactionDate,
                                             String memo, String debitAccountCode, String creditAccountCode) {
        if (partnerId == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "통장거래 거래처 매칭이 필요합니다");
        }
        validateAccounts(debitAccountCode, creditAccountCode);
        String slipNo = numberService.next(transactionDate);
        CashReceipt receipt = CashReceipt.createBankLinked(
                slipNo,
                partnerId,
                amount,
                transactionDate,
                memo,
                debitAccountCode,
                creditAccountCode);
        return repository.save(receipt);
    }

    /** 입금보고서 목록 조회. */
    @Transactional(readOnly = true)
    public Page<CashReceiptResponse> list(String partnerCode, String bizNo, String partnerName, String slipNo,
                                          LocalDate from, LocalDate to,
                                          CashReceiptStatus status, CashReceiptKind kind,
                                          Pageable pageable) {
        List<UUID> partnerIds = resolvePartnerFilterIds(partnerCode, bizNo, partnerName);
        if (partnerIds != null && partnerIds.isEmpty()) {
            return Page.empty(pageable);
        }
        Page<CashReceipt> page = repository.findAll(spec(partnerIds, slipNo, from, to, status, kind), pageable);
        Map<UUID, PartnerSummary> partners = resolveDisplays(page.getContent());
        Map<UUID, String> journalNos = resolveJournalNos(page.getContent());
        return page.map(receipt -> CashReceiptResponse.of(
                receipt,
                displayOf(partners.get(receipt.getPartnerId())),
                journalNoOf(receipt.getJournalId(), journalNos),
                journalNoOf(receipt.getReverseJournalId(), journalNos),
                responseLines(receipt)));
    }

    /** 단건 조회. */
    @Transactional(readOnly = true)
    public CashReceiptResponse getOne(UUID id) {
        return responseOf(findOrThrow(id));
    }

    /**
     * REST PATCH 상태 분기 — 3분기: BANK_LINKED 는 선행 409 거부, DRAFT 는 단순 수정,
     * CONFIRMED 는 역분개 후 재게시한다.
     */
    public CashReceiptResponse update(UUID id, CashReceiptRequest request, String actorUserId) {
        CashReceipt receipt = findOrThrow(id);
        if (receipt.getKind() == CashReceiptKind.BANK_LINKED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "통장연계 입금보고서는 수정할 수 없습니다. 취소 후 재생성하세요");
        }
        if (receipt.getStatus() == CashReceiptStatus.DRAFT) {
            return updateDraft(receipt, request);
        }
        if (receipt.getStatus() == CashReceiptStatus.CONFIRMED) {
            return updateConfirmed(receipt, request, actorUserId);
        }
        throw new BusinessException(ErrorCode.CONFLICT,
                "입금보고서 수정은 " + CashReceiptStatus.DRAFT.getDisplayName()
                        + "/" + CashReceiptStatus.CONFIRMED.getDisplayName()
                        + " 상태에서만 허용됩니다 (현재: " + receipt.getStatus().getDisplayName() + ")");
    }

    private CashReceiptResponse updateDraft(CashReceipt receipt, CashReceiptRequest request) {
        receipt.requireDraft("입금보고서 수정은 " + CashReceiptStatus.DRAFT.getDisplayName() + " 상태에서만 허용됩니다");
        PartnerSummary partner = resolveHeaderPartner(request);
        updateDraft(receipt, new CashReceiptDraftCommand(
                partner.partnerId(),
                request.amount(),
                request.transactionDate(),
                request.memo(),
                request.debitAccountCode(),
                request.creditAccountCode()));
        applyLines(receipt, request);
        return responseOf(receipt);
    }

    private CashReceiptResponse updateDraft(CashReceipt receipt, CashReceiptDraftCommand command) {
        receipt.requireDraft("입금보고서 수정은 " + CashReceiptStatus.DRAFT.getDisplayName() + " 상태에서만 허용됩니다");
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

    /** DRAFT → CONFIRMED 후 POSTED 자동 분개를 생성한다. 마감된 회계 기간 일자는 409. */
    public CashReceiptResponse confirm(UUID id, String actorUserId) {
        CashReceipt receipt = findOrThrow(id);
        receipt.confirm();
        if (receipt.getJournalId() != null) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 분개가 연결된 입금보고서는 다시 확정할 수 없습니다");
        }
        requireOpenPeriod(receipt.getTransactionDate());
        Journal journal = postReceiptJournal(receipt,
                "입금보고서 확정 " + receipt.getSlipNo() + partnerNameSuffix(receipt), actorUserId);
        receipt.linkJournal(journal.getId());
        log.info("입금보고서 확정 분개 게시 — slipNo={}, journalNo={}, actor={}",
                receipt.getSlipNo(), journal.getJournalNo(), actorUserId);
        scheduleAgingRefreshAfterCommit(receipt.getSlipNo());
        return responseOf(receipt);
    }

    /**
     * CONFIRMED → CANCELLED 후 원분개가 있으면 자동 역분개를 생성한다.
     *
     * <p>원분개 일자가 마감된 회계 기간이면 상태 전이 전에 409로 차단한다. 실제 역분개
     * 생성 직전에도 {@link JournalService#autoReverse(UUID, String)} 가 같은 가드를 다시 수행한다.
     *
     * <p>BANK_LINKED kind 는 취소 시 연결된 통장거래를 UNREFLECTED 로 원복해 재사용 가능하게 한다.
     */
    public CashReceiptResponse cancel(UUID id, String actorUserId) {
        CashReceipt receipt = findOrThrow(id);
        if (receipt.getJournalId() != null) {
            journalService.requireOriginalJournalOpenForReversal(receipt.getJournalId());
        }
        receipt.cancel();
        if (receipt.getJournalId() != null) {
            Journal reversal = journalService.autoReverse(receipt.getJournalId(), actorUserId);
            receipt.linkReverseJournal(reversal.getId());
            log.info("입금보고서 취소 역분개 게시 — slipNo={}, reverseJournalNo={}, actor={}",
                    receipt.getSlipNo(), reversal.getJournalNo(), actorUserId);
        }
        if (receipt.getKind() == CashReceiptKind.BANK_LINKED) {
            unlinkBankTransactions(receipt);
        }
        scheduleAgingRefreshAfterCommit(receipt.getSlipNo());
        return responseOf(receipt);
    }

    /** DRAFT 입금보고서 soft-delete. */
    public void deleteDraft(UUID id, String actor) {
        findOrThrow(id).softDeleteDraft(actor);
    }

    /** 협업 수정완료 changeSet 을 DRAFT 입금보고서에 적용한다. */
    public CashReceiptResponse applyOverlayPatchBatch(UUID id, Map<String, Object> patches) {
        if (patches == null || patches.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "적용할 입금보고서 변경 내역이 없습니다");
        }
        CashReceipt current = findOrThrow(id);
        current.requireDraft("입금보고서 수정은 " + CashReceiptStatus.DRAFT.getDisplayName() + " 상태에서만 허용됩니다");
        CashReceiptDraftCommand merged = merge(current, patches);
        return updateDraft(current, merged);
    }

    private CashReceiptResponse updateConfirmed(CashReceipt receipt, CashReceiptRequest request,
                                                String actorUserId) {
        PartnerSummary partner = resolveHeaderPartner(request);
        validateAccounts(request.debitAccountCode(), request.creditAccountCode());
        if (isUnchanged(receipt, request, partner.partnerId())) {
            // 무변경 저장 — 역분개+재게시를 생략해 원장 노이즈(분개 2건/저장)를 차단한다.
            return responseOf(receipt);
        }
        requireOpenPeriod(request.transactionDate());
        UUID oldJournalId = receipt.getJournalId();
        if (oldJournalId != null) {
            journalService.requireOriginalJournalOpenForReversal(oldJournalId);
        }
        receipt.updateConfirmed(
                request.amount(),
                request.transactionDate(),
                request.memo(),
                partner.partnerId(),
                request.debitAccountCode(),
                request.creditAccountCode());
        applyLines(receipt, request);
        if (oldJournalId != null) {
            journalService.autoReverse(oldJournalId, actorUserId);
        }
        // 재게시 적요는 최초 확정과 구분해 원장 감사 추적성을 확보한다.
        Journal journal = postReceiptJournal(receipt,
                "입금보고서 수정 재게시 " + receipt.getSlipNo() + partnerNameSuffix(partner), actorUserId);
        receipt.linkJournal(journal.getId());
        log.info("입금보고서 수정 재게시 — slipNo={}, oldJournalId={}, newJournalNo={}, actor={}",
                receipt.getSlipNo(), oldJournalId, journal.getJournalNo(), actorUserId);
        scheduleAgingRefreshAfterCommit(receipt.getSlipNo());
        return responseOf(receipt);
    }

    /** CONFIRMED 수정 요청이 저장값과 완전히 동일한지 — 동일하면 역분개+재게시를 생략한다. */
    private boolean isUnchanged(CashReceipt receipt, CashReceiptRequest request, UUID resolvedPartnerId) {
        return Objects.equals(receipt.getPartnerId(), resolvedPartnerId)
                && receipt.getAmount() != null && request.amount() != null
                && receipt.getAmount().compareTo(request.amount()) == 0
                && Objects.equals(receipt.getTransactionDate(), request.transactionDate())
                && Objects.equals(receipt.getMemo(), request.memo())
                && receipt.getDebitAccountCode().equals(
                        normalizedOrDefault(request.debitAccountCode(), CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE))
                && receipt.getCreditAccountCode().equals(
                        normalizedOrDefault(request.creditAccountCode(), CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE));
    }

    private static String normalizedOrDefault(String accountCode, String defaultCode) {
        return accountCode == null || accountCode.isBlank() ? defaultCode : accountCode.trim();
    }

    /** 마감된 회계 기간이면 409 — 수기 분개 생성(JournalService.create)과 동일 규칙을 자동 게시에도 적용. */
    private void requireOpenPeriod(LocalDate journalDate) {
        monthEndCloseService.findClosedPeriodCovering(journalDate)
                .ifPresent(p -> {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "마감된 회계 기간입니다 — 해당 일자(" + journalDate + ")의 입금보고서는 확정/수정할 수 없습니다");
                });
    }

    private Journal postReceiptJournal(CashReceipt receipt, String description, String actorUserId) {
        List<JournalService.AutoJournalLineSpec> lineSpecs = new ArrayList<>();
        for (PersistedLine line : journalLines(receipt)) {
            lineSpecs.add(new JournalService.AutoJournalLineSpec(
                    receipt.getDebitAccountCode(), line.amount(), BigDecimal.ZERO, line.partnerId(), line.memo()));
            lineSpecs.add(new JournalService.AutoJournalLineSpec(
                    receipt.getCreditAccountCode(), BigDecimal.ZERO, line.amount(), line.partnerId(), line.memo()));
        }
        return journalService.postAutoJournal(
                receipt.getTransactionDate(),
                description,
                JournalSourceType.CASH_RECEIPT,
                receipt.getId(),
                actorUserId,
                lineSpecs);
    }

    private List<PersistedLine> journalLines(CashReceipt receipt) {
        if (receipt.getLinesJson() == null || receipt.getLinesJson().isBlank()) {
            return List.of(new PersistedLine(receipt.getPartnerId(), null, null, null,
                    receipt.getAmount(), receipt.getMemo()));
        }
        try {
            return objectMapper.readValue(receipt.getLinesJson(),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, PersistedLine.class));
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "입금보고서 행 분개 변환에 실패했습니다");
        }
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

    private void unlinkBankTransactions(CashReceipt receipt) {
        List<BankTransaction> linkedTransactions =
                bankTransactionRepository.findByCashReceiptIdAndIsDeletedFalse(receipt.getId());
        for (BankTransaction transaction : linkedTransactions) {
            try {
                transaction.unlinkCashReceipt();
            } catch (BusinessException ex) {
                throw new BusinessException(ex.getErrorCode(),
                        "통장연계 입금보고서 취소 원복 실패: " + ex.getMessage(), ex);
            }
        }
    }

    private Specification<CashReceipt> spec(List<UUID> partnerIds, String slipNo, LocalDate from, LocalDate to,
                                            CashReceiptStatus status, CashReceiptKind kind) {
        return (root, query, cb) -> {
            java.util.List<jakarta.persistence.criteria.Predicate> predicates =
                    new java.util.ArrayList<>();
            if (partnerIds != null && !partnerIds.isEmpty()) {
                predicates.add(root.get("partnerId").in(partnerIds));
            }
            if (hasText(slipNo)) {
                String pattern = "%" + slipNo.trim().toLowerCase(java.util.Locale.ROOT)
                        .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                predicates.add(cb.like(cb.lower(root.get("slipNo")), pattern, '\\'));
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

    private List<UUID> resolvePartnerFilterIds(String partnerCode, String bizNo, String partnerName) {
        if (hasText(partnerCode) || hasText(bizNo)) {
            PartnerSummary partner = resolvePartner(partnerCode, bizNo, null);
            return partner.partnerId() == null ? List.of() : List.of(partner.partnerId());
        }
        if (hasText(partnerName)) {
            return PartnerLookupSupport.availableDirectory(
                            PartnerLookupSupport.directory(partnerLookupClient, partnerName.trim(), 100)).stream()
                    .map(PartnerSummary::partnerId)
                    .filter(Objects::nonNull)
                    .distinct()
                    .toList();
        }
        return null;
    }

    private PartnerSummary resolvePartner(CashReceiptRequest request) {
        return resolvePartner(request.partnerCode(), request.bizNo(), request.partnerName());
    }

    private PartnerSummary resolvePartner(String partnerCode, String bizNo, String partnerName) {
        if (hasText(partnerCode)) {
            PartnerSummary partner = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode.trim()),
                    "거래처코드로 거래처를 찾을 수 없습니다: " + partnerCode);
            if (partner.partnerId() == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                        "거래처코드 조회 결과에 내부 거래처 ID가 없습니다: " + partnerCode);
            }
            return partner;
        }
        if (hasText(bizNo)) {
            return resolveByDirectorySingle(bizNo.trim(), "사업자번호");
        }
        if (hasText(partnerName)) {
            PartnerSummary partner = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byName(partnerLookupClient, partnerName.trim()),
                    "거래처명으로 거래처를 찾을 수 없습니다: " + partnerName);
            if (partner.partnerId() == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                        "거래처명 조회 결과에 내부 거래처 ID가 없습니다: " + partnerName);
            }
            return partner;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "partnerCode, bizNo, partnerName 중 하나는 필수입니다");
    }

    private PartnerSummary resolveByDirectorySingle(String query, String label) {
        List<PartnerSummary> matches = PartnerLookupSupport.availableDirectory(
                PartnerLookupSupport.directory(partnerLookupClient, query, 2));
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

    /**
     * 단건 응답 조립 — createManual/updateDraft/confirm/cancel/updateConfirmed/getOne 공용
     * write/detail 경로. 표시명은 부수 정보이므로 partner-service 장애 시에도 오퍼레이션을
     * 롤백하지 않고 표시만 공란으로 성사시킨다 (#924 개발책임자 결정).
     *
     * <p>단, "조회 실패"(UNAVAILABLE)와 "진짜 미등록"(NOT_FOUND)은 서로 다른 표시를 쓴다 —
     * {@link #resolvePartnerDisplay} 참고(#831 R-3 재수렴, 라이브 실측: 장애 중에도 "미등록"/
     * "(미조회)" 로 위장해 실존 거래처를 없는 것처럼 보여준 결함).
     */
    private CashReceiptResponse responseOf(CashReceipt receipt) {
        Map<UUID, String> journalNos = resolveJournalNos(List.of(receipt));
        return CashReceiptResponse.of(
                receipt,
                resolvePartnerDisplay(receipt),
                journalNoOf(receipt.getJournalId(), journalNos),
                journalNoOf(receipt.getReverseJournalId(), journalNos),
                responseLines(receipt));
    }

    /** 행 합계가 총액과 같은 경우에만 분할 행을 저장한다. 빈행은 프론트에서 제외되어 도착한다. */
    private void applyLines(CashReceipt receipt, CashReceiptRequest request) {
        if (request.lines() == null || request.lines().isEmpty()) {
            receipt.replaceLinesJson(null);
            return;
        }
        BigDecimal total = BigDecimal.ZERO;
        List<PersistedLine> persisted = new ArrayList<>();
        for (CashReceiptLineRequest line : request.lines()) {
            if (line == null || line.amount() == null || line.amount().signum() <= 0) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "입금보고서 행 금액은 0보다 커야 합니다");
            }
            PartnerSummary partner = resolvePartner(line.partnerCode(), line.bizNo(), line.partnerName());
            total = total.add(line.amount());
            persisted.add(new PersistedLine(partner.partnerId(), partner.partnerCode(), partner.bizNo(),
                    partner.name(), line.amount(), line.memo()));
        }
        if (total.compareTo(receipt.getAmount()) != 0) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "행 합계가 입금 총액과 같아야 합니다");
        }
        try {
            receipt.replaceLinesJson(objectMapper.writeValueAsString(persisted));
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "입금보고서 행 저장에 실패했습니다");
        }
    }

    private List<CashReceiptLineResponse> responseLines(CashReceipt receipt) {
        if (receipt.getLinesJson() == null || receipt.getLinesJson().isBlank()) {
            PartnerDisplay partner = resolvePartnerDisplay(receipt);
            return List.of(new CashReceiptLineResponse(partner.partnerCode(), partner.bizNo(),
                    partner.partnerName(), receipt.getAmount(), receipt.getMemo()));
        }
        try {
            List<PersistedLine> rows = objectMapper.readValue(receipt.getLinesJson(),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, PersistedLine.class));
            return rows.stream().map(row -> new CashReceiptLineResponse(row.partnerCode(), row.bizNo(),
                    row.partnerName(), row.amount(), row.memo())).toList();
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "입금보고서 행 조회에 실패했습니다");
        }
    }

    private PartnerSummary resolveHeaderPartner(CashReceiptRequest request) {
        if (hasText(request.partnerCode()) || hasText(request.bizNo()) || hasText(request.partnerName())) {
            return resolvePartner(request);
        }
        if (request.lines() != null && !request.lines().isEmpty()) {
            CashReceiptLineRequest line = request.lines().get(0);
            return resolvePartner(line.partnerCode(), line.bizNo(), line.partnerName());
        }
        return resolvePartner(request);
    }

    private record PersistedLine(UUID partnerId, String partnerCode, String bizNo, String partnerName,
                                 BigDecimal amount, String memo) {
    }

    /**
     * write/detail 표시 조립 — UNAVAILABLE(조회 실패)과 진짜 NOT_FOUND(미등록)를 구별한다(#831 R-3).
     *
     * <p>{@link #resolveDisplaysOrEmpty}(및 그 기반인 {@link PartnerLookupSupport#batchOrEmpty})는
     * UNAVAILABLE 을 빈 맵으로 흡수하므로, 그 결과만 보고는 "partner-service 가 장애라 못 찾았음"과
     * "정상 응답했는데 그 거래처가 원래 없음(삭제/고아 partnerId)"을 구별할 수 없다. {@link #displayOf}
     * 는 이 둘을 구별하지 못한 채 partner==null 이면 항상 "미등록"/"(미조회)" 를 반환하는데, 이는
     * "확정적으로 존재하지 않는다"는 사실 주장이다 — partner-service 장애로 조회만 못 한 경우에
     * 재사용하면 실존 거래처를 없는 것처럼 위장하게 된다(라이브 실측: 장애 중 HTTP 200 +
     * "미등록"/"(미조회)", 그 partnerId 는 partner_db 에 실재했다).
     *
     * <p>여기서는 batch 조회 결과의 UNAVAILABLE 여부를 직접 보존해, UNAVAILABLE 이면
     * {@link #PARTNER_DISPLAY_LOOKUP_UNAVAILABLE}(모든 필드 공란/null — "미등록" 같은 확정적
     * 문구가 FE 편집 폼에 하이드레이트돼 그대로 재저장(PATCH)돼도 실 조회 키로 오인되지 않는다)로
     * 분기하고, 그 외(FOUND, 요청한 id 가 매칭되지 않는 부분/빈 맵 포함)는 기존 {@link #displayOf}
     * 를 그대로 써 진짜 NOT_FOUND 표시("미등록"/"(미조회)")를 무회귀로 유지한다.
     */
    private PartnerDisplay resolvePartnerDisplay(CashReceipt receipt) {
        UUID partnerId = receipt.getPartnerId();
        if (partnerId == null) {
            return displayOf(null);
        }
        PartnerLookupClient.BatchLookupResult result =
                PartnerLookupSupport.batch(partnerLookupClient, List.of(partnerId));
        if (result.isUnavailable()) {
            return PARTNER_DISPLAY_LOOKUP_UNAVAILABLE;
        }
        return displayOf(keyByPartnerId(result.partners()).get(partnerId));
    }

    /**
     * 목록 조회(read 리포트) 전용 — 파트너 신원이 곧 행의 의미이므로 partner-service 장애 시
     * fail-closed(502)를 유지한다 (#924 개발책임자 결정, 근본 fix 정당분 — 되돌리지 않음).
     * write/detail 단건 경로는 {@link #resolveDisplaysOrEmpty} 를 쓴다.
     */
    private Map<UUID, PartnerSummary> resolveDisplays(List<CashReceipt> receipts) {
        List<UUID> ids = extractPartnerIds(receipts);
        if (ids.isEmpty()) {
            return Map.of();
        }
        return keyByPartnerId(partnerLookupClient.findByPartnerIdsBatch(ids));
    }

    /**
     * 단건 write/detail 경로 전용(#924 개발책임자 결정) — partner-service 장애 시 표시명을
     * 공란(빈 맵)으로 흡수하고 오퍼레이션은 롤백하지 않는다. {@link #responseOf},
     * {@link #partnerNameSuffix(CashReceipt)} 가 사용한다.
     */
    private Map<UUID, PartnerSummary> resolveDisplaysOrEmpty(List<CashReceipt> receipts) {
        List<UUID> ids = extractPartnerIds(receipts);
        if (ids.isEmpty()) {
            return Map.of();
        }
        return keyByPartnerId(PartnerLookupSupport.batchOrEmpty(partnerLookupClient, ids));
    }

    private static List<UUID> extractPartnerIds(List<CashReceipt> receipts) {
        return receipts.stream()
                .map(CashReceipt::getPartnerId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private static Map<UUID, PartnerSummary> keyByPartnerId(Map<UUID, PartnerSummary> resolved) {
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
        LinkedHashSet<UUID> ids = new LinkedHashSet<>();
        receipts.stream()
                .map(CashReceipt::getJournalId)
                .filter(Objects::nonNull)
                .forEach(ids::add);
        receipts.stream()
                .map(CashReceipt::getReverseJournalId)
                .filter(Objects::nonNull)
                .forEach(ids::add);
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

    /**
     * 분개 적요용 거래처명 접미사 — 미조회 시 빈 문자열(괄호부 생략)로, "(미조회)" 같은
     * 폴백 문자열이 불변 원장에 영구 각인되는 것을 방지한다.
     */
    private String partnerNameSuffix(CashReceipt receipt) {
        PartnerSummary partner = resolveDisplaysOrEmpty(List.of(receipt)).get(receipt.getPartnerId());
        return partnerNameSuffix(partner);
    }

    private static String partnerNameSuffix(PartnerSummary partner) {
        if (partner == null || partner.name() == null || partner.name().isBlank()) {
            return "";
        }
        return " (" + partner.name().trim() + ")";
    }

    private void scheduleAgingRefreshAfterCommit(String slipNo) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            refreshAgingSnapshotSafely(slipNo);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                refreshAgingSnapshotSafely(slipNo);
            }
        });
    }

    private void refreshAgingSnapshotSafely(String slipNo) {
        try {
            agingSnapshotRefreshService.refresh();
        } catch (RuntimeException ex) {
            log.warn("입금보고서 변경 후 partner_aging_snapshot refresh 실패 - 기능은 계속 진행합니다. slipNo={}, error={}",
                    slipNo, ex.getMessage(), ex);
        }
    }

    private static String journalNoOf(UUID journalId, Map<UUID, String> journalNos) {
        return journalId == null ? null : journalNos.get(journalId);
    }

    /**
     * partner-service 장애(UNAVAILABLE)로 조회 자체를 못 한 경우 전용 표시(#831 R-3).
     *
     * <p>partnerCode/partnerName 을 null 로 둬(bizNo 는 다른 분기와 동일하게 항상 "") 진짜
     * NOT_FOUND 표시("미등록"/"(미조회)")와 결과가 절대 같아지지 않게 한다. {@link CashReceiptResponse}
     * 는 {@code @JsonInclude(NON_NULL)} 이라 null 필드는 JSON 에서 아예 생략되므로, FE 편집 폼이
     * 이 값을 무심코 하이드레이트해 그대로 PATCH 로 되돌려보내도 "존재하지 않는 거래처코드/거래처명"
     * 으로 오인되어 조회를 시도할 문자열 자체가 없다 — {@code CashReceiptService.partnerNameSuffix}
     * 가 "(미조회)" 폴백을 피해 빈 문자열을 쓰는 것과 같은 설계 원칙(원장에 위장 문구를 각인하지 않음)
     * 을 API 응답에도 그대로 적용한다.
     */
    private static final PartnerDisplay PARTNER_DISPLAY_LOOKUP_UNAVAILABLE = new PartnerDisplay(null, "", null);

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
