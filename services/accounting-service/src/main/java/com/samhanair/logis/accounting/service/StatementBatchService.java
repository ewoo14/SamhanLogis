package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.StatementBatchRow;
import com.samhanair.logis.accounting.web.dto.StatementBatchRow.StatementLine;
import com.samhanair.logis.accounting.web.dto.StatementBatchRow.StatementSlip;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래명세서 batch service (PR-E2 BE-A10).
 *
 * <p>legacy GAS 4번 "거래처별 일괄 거래명세서" — 매출 분개 + 세금계산서 라인 snapshot +
 * 거래처별 그룹핑.
 *
 * <p>본 슬라이스는 ISSUED 상태의 세금계산서를 라인 snapshot 으로 사용 (자체 발행 데이터).
 * 거래처(partnerId) 별로 그룹핑하여 응답.
 *
 * <p>read-only — 외부 client 2종 의존 (PartnerLookupClient, ChatRoomMappingClient) — IT @MockBean.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StatementBatchService {

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final ChatRoomMappingClient chatRoomMappingClient;

    /**
     * 기간 내 ISSUED 세금계산서 → 거래처별 그룹핑 batch.
     *
     * @param from supplyDate 시작 (inclusive)
     * @param to supplyDate 종료 (inclusive)
     * @return 거래처별 명세서 그룹 리스트 (partnerId snapshot 순서 보존)
     */
    public List<StatementBatchRow> batch(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 는 from 이후여야 합니다");
        }
        List<TaxInvoice> issued = taxInvoiceRepository
                .findIssuedInRange(TaxInvoiceStatus.ISSUED, from, to);

        // partnerId → group
        Map<UUID, List<TaxInvoice>> byPartner = new LinkedHashMap<>();
        for (TaxInvoice ti : issued) {
            byPartner.computeIfAbsent(ti.getPartnerId(), k -> new ArrayList<>()).add(ti);
        }

        List<StatementBatchRow> rows = new ArrayList<>(byPartner.size());
        Set<String> selectionKeys = new HashSet<>();
        for (Map.Entry<UUID, List<TaxInvoice>> e : byPartner.entrySet()) {
            List<TaxInvoice> partnerInvoices = e.getValue();
            // repository가 보장하는 공급일자 ASC + 전표번호 ASC 순서를 대표 snapshot 선택 순서로 사용한다.
            // 첫 invoice 하나만 보면 후속 invoice에만 남은 유효 snapshot을 놓칠 수 있다.
            String partnerCode = firstNonBlank(partnerInvoices, TaxInvoice::getPartnerCode);
            String bizNo = firstNonBlank(partnerInvoices, TaxInvoice::getPartnerBusinessNo);
            String partnerName = firstNonBlank(partnerInvoices, TaxInvoice::getPartnerName);

            // 선택 key는 표시 코드/사업자번호와 분리한다. partnerId 그룹 key와 1:1이므로
            // namespace 교차 충돌·쉼표·blank snapshot 모두 선택 계약에 영향을 주지 않는다.
            String selectionKey = e.getKey() == null ? "partner-null" : e.getKey().toString();
            if (!selectionKeys.add(selectionKey)) {
                throw new IllegalStateException("거래명세서 선택 key 충돌: " + selectionKey);
            }
            if (e.getKey() != null) {
                PartnerSummary ps = partnerLookupClient.findByPartnerId(e.getKey())
                        .orElse(null);
                if (ps != null) {
                    if (ps.partnerCode() != null && !ps.partnerCode().isBlank()) {
                        partnerCode = ps.partnerCode();
                    }
                    if (ps.bizNo() != null && !ps.bizNo().isBlank()) {
                        bizNo = ps.bizNo();
                    }
                    if (ps.name() != null && !ps.name().isBlank()) {
                        partnerName = ps.name();
                    }
                }
            }

            List<String> chatRooms = partnerCode == null || partnerCode.isBlank()
                    ? List.of()
                    : chatRoomMappingClient.findChatRoomNamesByPartnerCode(partnerCode);

            List<StatementSlip> slips = new ArrayList<>(partnerInvoices.size());
            for (TaxInvoice ti : partnerInvoices) {
                List<StatementLine> lines = new ArrayList<>(ti.getLines().size());
                for (TaxInvoiceLine line : ti.getLines()) {
                    lines.add(new StatementLine(
                            line.getItemName(),
                            line.getSpec(),
                            line.getQuantity(),
                            line.getUnitPrice(),
                            line.getSupplyAmount(),
                            line.getVatAmount()));
                }
                slips.add(new StatementSlip(
                        ti.getTaxInvoiceNo(),
                        ti.getSupplyDate(),
                        ti.getSupplyAmount(),
                        ti.getVatAmount(),
                        ti.getTotalAmount(),
                        lines));
            }
            rows.add(new StatementBatchRow(selectionKey, partnerCode, bizNo, partnerName, chatRooms, slips));
        }
        return rows;
    }

    private static String firstNonBlank(List<TaxInvoice> invoices,
                                        java.util.function.Function<TaxInvoice, String> value) {
        for (TaxInvoice invoice : invoices) {
            String candidate = value.apply(invoice);
            if (candidate != null && !candidate.isBlank()) {
                return candidate;
            }
        }
        return null;
    }
}
