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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
        for (Map.Entry<UUID, List<TaxInvoice>> e : byPartner.entrySet()) {
            List<TaxInvoice> partnerInvoices = e.getValue();
            // partner snapshot (세금계산서 자체에 partnerName 보존되어 있어 fallback)
            TaxInvoice first = partnerInvoices.get(0);
            String partnerName = first.getPartnerName();
            // partner-service lookup → partnerCode. 외부 lookup 실패 시에도 발행 시점 snapshot key를 보존한다.
            // 모든 row를 "-"로 만들면 FE의 선택 query key가 충돌하여 선택 인쇄가 전체 인쇄로 변한다.
            String partnerCode = first.getPartnerCode();
            if (partnerCode == null || partnerCode.isBlank()) {
                // legacy/seed invoice는 관리코드가 비어 있을 수 있으므로 사업자번호를
                // 사용자 노출 가능한 고유 business key로 사용한다.
                partnerCode = first.getPartnerBusinessNo();
            }
            if (partnerCode == null || partnerCode.isBlank()) {
                partnerCode = "-";
            }
            if (e.getKey() != null) {
                PartnerSummary ps = partnerLookupClient.findByPartnerId(e.getKey())
                        .orElse(null);
                if (ps != null) {
                    if (ps.partnerCode() != null && !ps.partnerCode().isBlank()) {
                        partnerCode = ps.partnerCode();
                    }
                    if (ps.name() != null && !ps.name().isBlank()) {
                        partnerName = ps.name();
                    }
                }
            }

            List<String> chatRooms = chatRoomMappingClient
                    .findChatRoomNamesByPartnerCode(partnerCode);

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
            rows.add(new StatementBatchRow(partnerCode, partnerName, chatRooms, slips));
        }
        return rows;
    }
}
