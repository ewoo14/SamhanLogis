package com.samhanair.logis.accounting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse.LedgerLine;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처별 원장 데이터 service (PR-E2 BE-A9).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" — 분개 line + 거래처 snapshot + 단톡방 정보.
 *
 * <p>read-only — 외부 client 2종 의존 (PartnerLookupClient, ChatRoomMappingClient) — IT @MockBean
 * 격리 의무.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LedgerImageService {

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final ChatRoomMappingClient chatRoomMappingClient;
    private final TaxInvoiceBatchRepository taxInvoiceBatchRepository;
    private final ObjectMapper objectMapper;

    private static final DateTimeFormatter BATCH_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    /**
     * partnerCode 기반 원장 데이터 조회.
     *
     * @param partnerCode 거래처코드 (필수)
     * @param from 조회 시작 (inclusive)
     * @param to 조회 종료 (inclusive)
     * @return 거래처 snapshot + 단톡방 매핑 + 원장 라인 (시간순, 누적 잔액 포함)
     * @throws BusinessException(NOT_FOUND) partnerCode 미존재
     */
    public LedgerImageResponse getLedger(String partnerCode, LocalDate from, LocalDate to) {
        return getLedger(partnerCode, from, to, null);
    }

    /** 작업자 audit 값을 포함한 거래처별 원장 조회·자동 저장. */
    public LedgerImageResponse getLedger(String partnerCode, LocalDate from, LocalDate to,
                                         UUID actorUserId) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 는 필수입니다");
        }
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        PartnerSummary summary = PartnerLookupSupport.requireFound(
                PartnerLookupSupport.byCode(partnerLookupClient, partnerCode),
                ErrorCode.NOT_FOUND,
                "존재하지 않는 거래처입니다: " + partnerCode);

        List<String> chatRooms = chatRoomMappingClient
                .findChatRoomNamesByPartnerCode(partnerCode);

        List<JournalLine> lines = summary.partnerId() == null
                ? List.of()
                : journalLineRepository.findPartnerLinesInRange(summary.partnerId(), from, to);

        // SP-08-FU2 P2-4 — accountName 매핑 캐시 (N+1 방지)
        Set<String> accountCodes = lines.stream()
                .map(JournalLine::getAccountCode)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, String> accountNameCache = chartOfAccountRepository.findAllById(accountCodes)
                .stream()
                .collect(Collectors.toMap(ChartOfAccount::getCode, ChartOfAccount::getName));

        List<LedgerLine> ledgerLines = new ArrayList<>(lines.size());
        BigDecimal balance = BigDecimal.ZERO;
        for (JournalLine l : lines) {
            // 차변잔액 normal — debit 가산 / credit 감산
            balance = balance.add(l.getDebitAmount()).subtract(l.getCreditAmount());
            // SP-08-FU2 P2-4 — 계정명 캐시 조회 (없으면 null)
            String accountName = l.getAccountCode() != null
                    ? accountNameCache.get(l.getAccountCode())
                    : null;
            ledgerLines.add(new LedgerLine(
                    l.getJournal().getJournalDate(),
                    l.getJournal().getJournalNo(),
                    l.getAccountCode(),
                    accountName,
                    l.getMemo() == null ? l.getJournal().getDescription() : l.getMemo(),
                    l.getDebitAmount(),
                    l.getCreditAmount(),
                    balance));
        }

        LedgerImageResponse result = new LedgerImageResponse(
                summary.partnerCode(),
                summary.name(),
                summary.businessNo(),
                chatRooms,
                from,
                to,
                ledgerLines);
        TaxInvoiceBatch batch = TaxInvoiceBatch.createDocumentSnapshot(
                LedgerSnapshotService.DOCUMENT_TYPE, partnerCode,
                "LED-" + LocalDateTime.now().format(BATCH_TIME) + "-" + partnerCode,
                from, to, actorUserId);
        batch.complete(result.lines().size(), 1, null, null,
                SnapshotCompression.compress(objectMapper, result));
        taxInvoiceBatchRepository.save(batch);
        return result;
    }
}
