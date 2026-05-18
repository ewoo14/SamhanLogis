package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateDailyClosingRequest;
import com.samhanair.logis.accounting.web.dto.DailyClosingResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일마감 service (SP-08-6-5).
 *
 * <p>legacy GAS 12번 "일마감 프로그램" — 특정 날짜의 세금계산서(ISSUED) 집계 snapshot 생성.
 * {@link com.samhanair.logis.accounting.domain.AccountingPeriod} 의 DAILY 마감과 별개로
 * 운영된다 — DailyClosing 은 UI 표시/집계용, AccountingPeriod 는 분개 잠금/역마감용.
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>partnerCode 가 있으면 partner-service lookup → partnerId 도출</li>
 *   <li>TaxInvoiceRepository 에서 해당 날짜 ISSUED 세금계산서 집계</li>
 *   <li>DailyClosing 기존 snapshot 이 있으면 재계산, 없으면 신규 생성</li>
 *   <li>lock() 호출 → isLocked=true stamp</li>
 * </ol>
 *
 * <p>외부 client {@link PartnerLookupClient} 의존 — IT 에서 {@code @MockBean} 격리 의무.
 * ({@code feedback_it_mockbean_external_clients.md})
 */
@Service
@RequiredArgsConstructor
@Transactional
public class DailyClosingService {

    private final DailyClosingRepository dailyClosingRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 일마감 실행 — 세금계산서 집계 + lock.
     *
     * <p>동일 (closingDate, partnerCode) 조합이 이미 존재하면:
     * <ul>
     *   <li>isLocked=false → recalculate() 후 lock()</li>
     *   <li>isLocked=true  → CONFLICT 예외</li>
     * </ul>
     *
     * @param request     일마감 생성 요청 (closingDate + partnerCode)
     * @param actorUserId 마감 실행자 user-id
     * @return 생성된 DailyClosingResponse
     * @throws BusinessException(NOT_FOUND)  partnerCode 가 지정되었으나 partner-service 에서 미존재
     * @throws BusinessException(CONFLICT)   이미 잠금된 일마감
     */
    public DailyClosingResponse close(CreateDailyClosingRequest request, String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        LocalDate closingDate = request.closingDate();

        // (1) partnerCode → partnerId 도출
        UUID partnerId = null;
        String resolvedPartnerCode = null;
        if (request.partnerCode() != null && !request.partnerCode().isBlank()) {
            PartnerSummary summary = partnerLookupClient.findByPartnerCode(request.partnerCode())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "존재하지 않는 거래처입니다: " + request.partnerCode()));
            partnerId = summary.partnerId();
            resolvedPartnerCode = summary.partnerCode();
        }

        // (2) 세금계산서 ISSUED 집계
        List<TaxInvoice> issued = taxInvoiceRepository.findIssuedInRange(
                TaxInvoiceStatus.ISSUED, closingDate, closingDate);

        // partnerId 필터 적용 (전체 마감이면 전부, 거래처 마감이면 해당 거래처만)
        final UUID filterPartnerId = partnerId;
        if (filterPartnerId != null) {
            issued = issued.stream()
                    .filter(ti -> filterPartnerId.equals(ti.getPartnerId()))
                    .toList();
        }

        BigDecimal totalSupply = issued.stream()
                .map(TaxInvoice::getSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalVat = issued.stream()
                .map(TaxInvoice::getVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalAmount = issued.stream()
                .map(TaxInvoice::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int slipCount = issued.size();

        // (3) 기존 snapshot 조회 또는 신규 생성
        DailyClosing closing;
        if (filterPartnerId != null) {
            closing = dailyClosingRepository
                    .findByClosingDateAndPartnerId(closingDate, filterPartnerId)
                    .orElseGet(() -> dailyClosingRepository.save(
                            DailyClosing.create(closingDate, filterPartnerId,
                                    totalSupply, totalVat, totalAmount, slipCount)));
        } else {
            closing = dailyClosingRepository
                    .findByClosingDateAndPartnerIdIsNull(closingDate)
                    .orElseGet(() -> dailyClosingRepository.save(
                            DailyClosing.create(closingDate, null,
                                    totalSupply, totalVat, totalAmount, slipCount)));
        }

        // (4) 이미 저장된 row 는 recalculate + lock
        if (!closing.isLocked()) {
            closing.recalculate(totalSupply, totalVat, totalAmount, slipCount);
            closing.lock(actorUserId);
        } else {
            // isLocked=true → CONFLICT (도메인 메서드가 throw, 직접 호출하여 일관성 유지)
            closing.lock(actorUserId); // 내부에서 CONFLICT throw
        }

        return DailyClosingResponse.of(closing, resolvedPartnerCode);
    }

    /**
     * 일마감 기간 조회 (페이지네이션).
     *
     * @param from     조회 시작 날짜 (필수)
     * @param to       조회 종료 날짜 (필수)
     * @param pageable 페이지 정보
     * @return 일마감 snapshot 페이지
     */
    @Transactional(readOnly = true)
    public Page<DailyClosingResponse> list(LocalDate from, LocalDate to, Pageable pageable) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 는 from 이후여야 합니다");
        }
        Page<DailyClosing> page = dailyClosingRepository.findByDateRange(from, to, pageable);
        List<DailyClosingResponse> rows = page.getContent().stream()
                .map(d -> DailyClosingResponse.of(d, resolvePartnerCode(d.getPartnerId())))
                .toList();
        return new PageImpl<>(rows, pageable, page.getTotalElements());
    }

    /**
     * 일마감 잠금 해제 (MASTER 전용 — controller 가 role 가드).
     *
     * @param closingDate 마감 날짜 (필수)
     * @param partnerCode 거래처코드 (null = 전체 마감)
     * @param actorUserId 해제자 user-id
     * @return 갱신된 DailyClosingResponse
     * @throws BusinessException(NOT_FOUND)  해당 마감 미존재
     * @throws BusinessException(CONFLICT)   잠금 상태가 아닐 때
     */
    public DailyClosingResponse unlock(LocalDate closingDate, String partnerCode, String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        UUID partnerId = null;
        String resolvedPartnerCode = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            PartnerSummary summary = partnerLookupClient.findByPartnerCode(partnerCode)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "존재하지 않는 거래처입니다: " + partnerCode));
            partnerId = summary.partnerId();
            resolvedPartnerCode = summary.partnerCode();
        }

        DailyClosing closing = findExisting(closingDate, partnerId);
        closing.unlock(actorUserId);
        return DailyClosingResponse.of(closing, resolvedPartnerCode);
    }

    /** partnerId → partnerCode fail-soft 조회 (응답 노출용). */
    private String resolvePartnerCode(UUID partnerId) {
        if (partnerId == null) {
            return null;
        }
        return partnerLookupClient.findByPartnerId(partnerId)
                .map(PartnerSummary::partnerCode)
                .orElse(null);
    }

    private DailyClosing findExisting(LocalDate closingDate, UUID partnerId) {
        if (partnerId != null) {
            return dailyClosingRepository
                    .findByClosingDateAndPartnerId(closingDate, partnerId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "일마감이 존재하지 않습니다: " + closingDate));
        }
        return dailyClosingRepository
                .findByClosingDateAndPartnerIdIsNull(closingDate)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "일마감이 존재하지 않습니다: " + closingDate));
    }
}
