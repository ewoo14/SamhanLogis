package com.samhanair.logis.accounting.service;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.domain.DailyClosingScopeMode;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateDailyClosingRequest;
import com.samhanair.logis.accounting.web.dto.DailyClosingResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 *
 * <p>SP-D2 동적 권한 검증:
 * 기존 역할 가드에 더해 {@link DynamicPermissionClient} 를 통해
 * auth-service 의 동적 override 권한도 확인한다.
 * override row 미존재 또는 auth-service 장애 시에는 기존 role guard 만 적용.
 * 명시적 canEdit=false (view-only override) 시 403 반환.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DailyClosingService {

    /** SP-D2 — 일마감 조회 페이지 코드. */
    static final String VIEW_PAGE_CODE = "accounting.daily-closing";
    /** SP-D6-7 — 일마감 실행 페이지 코드. */
    static final String RUN_PAGE_CODE = "accounting.daily-closing.run";
    /** SP-D6-7 — 일마감 잠금 해제 페이지 코드. */
    static final String UNLOCK_PAGE_CODE = "accounting.daily-closing.unlock";

    private final DailyClosingRepository dailyClosingRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final SalesAccountingSlipRepository salesAccountingSlipRepository;
    private final PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final DynamicPermissionClient dynamicPermissionClient;
    private final DailyClosingVerificationService dailyClosingVerificationService;

    /**
     * 일마감 실행 — 세금계산서 집계 + lock.
     *
     * <p>동일 (closingDate, partnerCode) 조합이 이미 존재하면:
     * <ul>
     *   <li>isLocked=false → recalculate() 후 lock()</li>
     *   <li>isLocked=true  → CONFLICT 예외</li>
     * </ul>
     *
     * <p>SP-D2 동적 권한: actorRole 이 not-null 이면 canEdit 을 검증한다.
     * override row 없음 (fallback false) 시에는 기존 역할 가드 통과로 충분.
     * canView=true + canEdit=false 이면 명시적 deny → 403.
     *
     * @param request     일마감 생성 요청 (closingDate + partnerCode)
     * @param actorUserId 마감 실행자 user-id
     * @param actorRole   요청자 role (X-User-Role 헤더) — 동적 권한 검증에 사용
     * @return 생성된 DailyClosingResponse
     * @throws BusinessException(NOT_FOUND)  partnerCode 가 지정되었으나 partner-service 에서 미존재
     * @throws BusinessException(CONFLICT)   이미 잠금된 일마감
     * @throws BusinessException(FORBIDDEN)  동적 권한 차단 시
     */
    public DailyClosingResponse close(CreateDailyClosingRequest request, String actorUserId,
                                      String actorRole) {
        checkEditPermission(actorRole, actorUserId, RUN_PAGE_CODE);
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        DailyClosingScopeMode scopeMode = DailyClosingScopeMode.parse(request.scopeMode());
        validateScope(scopeMode, request.partnerCode());
        LocalDate closingDate = request.closingDate();
        DailyClosingKind closingKind = resolveClosingKind(request.closingKind());
        DailyClosingSourceKind sourceKind = resolveSourceKind(request.sourceKind());
        validateKindSourceMatch(closingKind, sourceKind);

        // (1) partnerCode → partnerId 도출
        UUID partnerId = null;
        String resolvedPartnerCode = null;
        String resolvedBizNo = "";
        if (request.partnerCode() != null && !request.partnerCode().isBlank()) {
            PartnerSummary summary = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byCode(partnerLookupClient, request.partnerCode()),
                    ErrorCode.NOT_FOUND,
                    "존재하지 않는 거래처입니다: " + request.partnerCode());
            partnerId = summary.partnerId();
            resolvedPartnerCode = summary.partnerCode();
            resolvedBizNo = bizNoDigits(summary);
        }

        // (2) sourceKind 별 집계
        final UUID filterPartnerId = partnerId;
        AggregationResult agg = switch (sourceKind) {
            case TAX_INVOICE -> aggregateFromTaxInvoices(closingDate, filterPartnerId, closingKind);
            case SALES_SLIP -> aggregateFromSalesSlips(closingDate, filterPartnerId);
            case PURCHASE_SLIP -> aggregateFromPurchaseSlips(closingDate, filterPartnerId);
        };

        DailyClosingVerificationService.VerificationResult q5 =
                dailyClosingVerificationService.verifyBeforeClose(closingDate, closingKind, sourceKind);
        if (!q5.allowed()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    q5.userMessage());
        }

        // (3) 기존 snapshot 조회 또는 신규 생성 (신규는 0으로 초기화 후 recalculate 로 일원화)
        DailyClosing closing;
        if (filterPartnerId != null) {
            closing = dailyClosingRepository
                    .findByClosingDateAndPartnerIdAndClosingKindAndSourceKind(
                            closingDate, filterPartnerId, closingKind, sourceKind)
                    .orElseGet(() -> dailyClosingRepository.save(
                            DailyClosing.createV2(closingDate, filterPartnerId, closingKind, sourceKind,
                                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0)));
        } else {
            closing = dailyClosingRepository
                    .findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(
                            closingDate, closingKind, sourceKind)
                    .orElseGet(() -> dailyClosingRepository.save(
                            DailyClosing.createV2(closingDate, null, closingKind, sourceKind,
                                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0)));
        }

        // (4) 잠금 상태 확인 후 recalculate + lock (신규/기존 모두 동일 경로)
        if (closing.isLocked()) {
            // 도메인 메서드 내부에서 CONFLICT throw — 일관성 유지
            closing.lock(actorUserId);
        }
        closing.recalculate(agg.totalSupply(), agg.totalVat(), agg.totalAmount(), agg.slipCount());
        closing.lock(actorUserId);

        return DailyClosingResponse.of(closing, resolvedPartnerCode, resolvedBizNo);
    }

    /** 새 일마감 요청의 명시적 거래처 범위와 실제 선택값을 이중 검증한다. */
    private static void validateScope(DailyClosingScopeMode scopeMode, String partnerCode) {
        boolean hasPartner = partnerCode != null && !partnerCode.isBlank();
        if ((scopeMode == DailyClosingScopeMode.ALL && hasPartner)
                || (scopeMode == DailyClosingScopeMode.SELECTED && !hasPartner)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "scopeMode 와 거래처 선택값이 일치하지 않습니다");
        }
    }

    /**
     * 일마감 기간 조회 (페이지네이션).
     *
     * <p>SP-D2 동적 권한: VIEW 권한 검증. override row 없으면 기존 role guard 통과로 충분.
     *
     * @param from      조회 시작 날짜 (필수)
     * @param to        조회 종료 날짜 (필수)
     * @param pageable  페이지 정보
     * @param actorRole 요청자 role (X-User-Role 헤더) — 동적 권한 검증에 사용
     * @return 일마감 snapshot 페이지
     */
    @Transactional(readOnly = true)
    public Page<DailyClosingResponse> list(LocalDate from, LocalDate to, Pageable pageable,
                                           String actorRole) {
        return list(from, to, null, null, null, pageable, actorRole);
    }

    @Transactional(readOnly = true)
    public Page<DailyClosingResponse> list(LocalDate from, LocalDate to,
                                           DailyClosingKind closingKind,
                                           DailyClosingSourceKind sourceKind,
                                           Pageable pageable,
                                           String actorRole) {
        return list(from, to, closingKind, sourceKind, null, pageable, actorRole);
    }

    /**
     * 일마감 기간 조회 (페이지네이션) — 거래처코드 필터 포함.
     *
     * <p>[#929 재수렴 T6] partnerCode 는 이전에 이 쿼리가 전혀 받지 않아 조용히
     * 버려졌다(#929 D) — FE 필터 입력이 페이지 결과에 아무 효과가 없어 "필터를
     * 넣었는데 페이지만 잃는다"는 결함이었다. close()/unlock() 과 동일하게
     * partnerCode → partnerId 를 도출해 repository 에 전달한다.
     *
     * <p>존재하지 않는 partnerCode 는 read 리포트 정책(#924 회계 enrichment
     * fail-closed)을 따른다 — NOT_FOUND(단순 미존재)는 "그 거래처의 마감은 있을 수
     * 없다"는 뜻이므로 빈 페이지로 성사시키고(하드 오류 아님, 필터 입력 오타에 페이지
     * 전체가 깨지지 않는다), partner-service 장애(UNAVAILABLE)만 502 로 표면화한다
     * (PartnerLookupSupport.foundOrNull).
     *
     * <p>[#929 재수렴 4차 D1·D2] "필터 입력 오타에 페이지 전체가 깨지지 않는다"는 위 불변식은
     * partnerCode 를 URI path 세그먼트로 전달할 수 없을 때도 지켜져야 한다. 그 판정은 계약이
     * 있는 {@link PartnerLookupClient#isAddressableAsPathSegment} 한 곳에서만 하며, 전달 불가
     * 입력은 NOT_FOUND 로 돌아와 위 빈 페이지 경로가 그대로 받는다.
     *
     * @param partnerCode 거래처코드 필터 (선택 — null/blank 면 미지정)
     */
    @Transactional(readOnly = true)
    public Page<DailyClosingResponse> list(LocalDate from, LocalDate to,
                                           DailyClosingKind closingKind,
                                           DailyClosingSourceKind sourceKind,
                                           String partnerCode,
                                           Pageable pageable,
                                           String actorRole) {
        checkViewPermission(actorRole);
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 는 필수입니다");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("to 는 from 이후여야 합니다");
        }
        if (closingKind != null && sourceKind != null) {
            validateKindSourceMatch(closingKind, sourceKind);
        }
        UUID filterPartnerId = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            // [#929 재수렴 4차 D1·D2] path 세그먼트로 전달 불가한 입력('%'·'/'·'\'·';'·단독
            // "."/".."·제어/분리 문자)의 단락 처리는 PartnerLookupClient 가 계약 지점에서
            // 수행한다 — 여기서 다시 판정하면 같은 값을 두 곳에서 계산하게 되고(3차 가드가
            // 실제로 그랬다: ';' 를 빠뜨려 자기 화면에서 우회됨), 같은 계약을 쓰는 나머지
            // 15개 호출부는 여전히 깨진 채 남는다. NOT_FOUND 로 돌아오므로 아래 빈 페이지 경로가 받는다.
            PartnerSummary filterPartner = PartnerLookupSupport.foundOrNull(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode));
            if (filterPartner == null) {
                // 존재하지 않는 거래처코드 — 그 코드로 매칭될 마감은 있을 수 없다.
                return new PageImpl<>(List.of(), pageable, 0);
            }
            filterPartnerId = filterPartner.partnerId();
        }
        Page<DailyClosing> page = dailyClosingRepository.findByDateRangeAndKinds(
                from, to, closingKind, sourceKind, filterPartnerId, pageable);
        List<DailyClosing> closings = page.getContent();
        Map<UUID, PartnerSummary> partners = resolvePartners(closings);
        List<DailyClosingResponse> rows = closings.stream()
                .map(d -> {
                    PartnerSummary summary = partnerSummaryOf(partners, d.getPartnerId());
                    return DailyClosingResponse.of(d, partnerCodeOf(summary), bizNoDigits(summary));
                })
                .toList();
        return new PageImpl<>(rows, pageable, page.getTotalElements());
    }

    /**
     * 일마감 잠금 해제 (MASTER 전용 — controller 가 role 가드).
     *
     * <p>SP-D2 동적 권한: MASTER 전용 endpoint 이므로 canEdit 검증 추가.
     *
     * @param closingDate 마감 날짜 (필수)
     * @param partnerCode 거래처코드 (null = 전체 마감)
     * @param actorUserId 해제자 user-id
     * @param actorRole   요청자 role (X-User-Role 헤더)
     * @return 갱신된 DailyClosingResponse
     * @throws BusinessException(NOT_FOUND)  해당 마감 미존재
     * @throws BusinessException(CONFLICT)   잠금 상태가 아닐 때
     * @throws BusinessException(FORBIDDEN)  동적 권한 차단 시
     */
    public DailyClosingResponse unlock(LocalDate closingDate, String partnerCode,
                                       String actorUserId, String actorRole) {
        return unlock(closingDate, partnerCode, DailyClosingKind.SALES,
                DailyClosingSourceKind.TAX_INVOICE, actorUserId, actorRole);
    }

    public DailyClosingResponse unlock(LocalDate closingDate, String partnerCode,
                                       DailyClosingKind closingKind,
                                       DailyClosingSourceKind sourceKind,
                                       String actorUserId, String actorRole) {
        checkEditPermission(actorRole, actorUserId, UNLOCK_PAGE_CODE);
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        DailyClosingKind resolvedKind = resolveClosingKind(closingKind);
        DailyClosingSourceKind resolvedSource = resolveSourceKind(sourceKind);
        validateKindSourceMatch(resolvedKind, resolvedSource);
        UUID partnerId = null;
        String resolvedPartnerCode = null;
        String resolvedBizNo = "";
        if (partnerCode != null && !partnerCode.isBlank()) {
            PartnerSummary summary = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode),
                    ErrorCode.NOT_FOUND,
                    "존재하지 않는 거래처입니다: " + partnerCode);
            partnerId = summary.partnerId();
            resolvedPartnerCode = summary.partnerCode();
            resolvedBizNo = bizNoDigits(summary);
        }

        DailyClosing closing = findExisting(closingDate, partnerId, resolvedKind, resolvedSource);
        closing.unlock(actorUserId);
        return DailyClosingResponse.of(closing, resolvedPartnerCode, resolvedBizNo);
    }

    private AggregationResult aggregateFromTaxInvoices(LocalDate closingDate, UUID partnerId,
                                                       DailyClosingKind closingKind) {
        List<TaxInvoice> issued = taxInvoiceRepository.findIssuedInRange(
                TaxInvoiceStatus.ISSUED, closingDate, closingDate).stream()
                .filter(ti -> partnerId == null || partnerId.equals(ti.getPartnerId()))
                .filter(ti -> matchesInvoiceType(ti, closingKind))
                .toList();
        return new AggregationResult(
                issued.stream().map(TaxInvoice::getSupplyAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                issued.stream().map(TaxInvoice::getVatAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                issued.stream().map(TaxInvoice::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                issued.size());
    }

    private AggregationResult aggregateFromSalesSlips(LocalDate closingDate, UUID partnerId) {
        List<SalesAccountingSlip> slips = salesAccountingSlipRepository
                .findBySlipDateAndStatus(closingDate, SalesSlipStatus.POSTED).stream()
                .filter(s -> partnerId == null || partnerId.equals(s.getPartnerId()))
                .toList();
        return new AggregationResult(
                slips.stream().map(SalesAccountingSlip::getTotalSupplyAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                slips.stream().map(SalesAccountingSlip::getTotalVatAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                slips.stream().map(SalesAccountingSlip::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                slips.size());
    }

    private AggregationResult aggregateFromPurchaseSlips(LocalDate closingDate, UUID partnerId) {
        List<PurchaseAccountingSlip> slips = purchaseAccountingSlipRepository
                .findBySlipDateAndStatus(closingDate, PurchaseSlipStatus.POSTED).stream()
                .filter(s -> partnerId == null || partnerId.equals(s.getPartnerId()))
                .toList();
        return new AggregationResult(
                slips.stream().map(PurchaseAccountingSlip::getTotalSupplyAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                slips.stream().map(PurchaseAccountingSlip::getTotalVatAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                slips.stream().map(PurchaseAccountingSlip::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                slips.size());
    }

    private static boolean matchesInvoiceType(TaxInvoice invoice, DailyClosingKind closingKind) {
        TaxInvoiceType invoiceType = invoice.getInvoiceType();
        if (closingKind == DailyClosingKind.SALES) {
            return invoiceType == null || invoiceType == TaxInvoiceType.SALES;
        }
        return invoiceType == TaxInvoiceType.PURCHASE;
    }

    static DailyClosingKind resolveClosingKind(DailyClosingKind closingKind) {
        return closingKind == null ? DailyClosingKind.SALES : closingKind;
    }

    static DailyClosingSourceKind resolveSourceKind(DailyClosingSourceKind sourceKind) {
        return sourceKind == null ? DailyClosingSourceKind.TAX_INVOICE : sourceKind;
    }

    static void validateKindSourceMatch(DailyClosingKind closingKind,
                                        DailyClosingSourceKind sourceKind) {
        if (closingKind == DailyClosingKind.SALES && sourceKind == DailyClosingSourceKind.PURCHASE_SLIP) {
            throw new IllegalArgumentException(closingKind.getDisplayName()
                    + "에는 " + sourceKind.getDisplayName() + "를 사용할 수 없습니다.");
        }
        if (closingKind == DailyClosingKind.PURCHASE && sourceKind == DailyClosingSourceKind.SALES_SLIP) {
            throw new IllegalArgumentException(closingKind.getDisplayName()
                    + "에는 " + sourceKind.getDisplayName() + "를 사용할 수 없습니다.");
        }
    }

    // =========================================================================
    // SP-D2 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D2 동적 EDIT 권한 검증.
     *
     * <p>actorRole 이 null/blank 이면 검증을 건너뜀 (기존 role guard 만 적용).
     * canEdit=false + canView=true 이면 명시적 deny → 403.
     * canEdit=false + canView=false 이면 override row 없음(fallback) → 통과.
     *
     * @param actorRole   요청자 role
     * @param actorUserId 요청자 user-id (로그용)
     */
    private void checkEditPermission(String actorRole, String actorUserId, String pageCode) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, pageCode);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, pageCode);
            if (canView) {
                log.warn("[SP-D2] 동적 권한 차단 (view-only override) — roleCode={} pageCode={} actorUserId={}",
                        actorRole, pageCode, actorUserId);
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "동적 권한 설정에 의해 일마감 편집 권한이 차단되었습니다.");
            }
            log.debug("[SP-D2] 동적 권한 override 없음 (fallback) — roleCode={} pageCode={} actorUserId={}",
                    actorRole, pageCode, actorUserId);
        }
    }

    /**
     * SP-D2 동적 VIEW 권한 검증.
     *
     * <p>actorRole 이 null/blank 이면 건너뜀.
     * canView=false 이며 override row 가 존재 (canEdit=true or canView=false but row exists) 이면 403.
     * 현재 구현: row 자체 존재 여부를 구분하지 않으므로 canView=false 는 통과 (보수적 점진 마이그레이션).
     *
     * @param actorRole 요청자 role
     */
    private void checkViewPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, VIEW_PAGE_CODE);
        if (!canView) {
            // VIEW=false: fallback(row 없음) 또는 명시적 deny.
            // 점진 마이그레이션 정책: 구분 불가 → 통과 (기존 role guard 가 이미 검증).
            log.debug("[SP-D2] VIEW 동적 권한 false (fallback 또는 deny) — roleCode={} pageCode={}",
                    actorRole, VIEW_PAGE_CODE);
        }
    }

    /** 일마감 페이지 내 partnerId 를 batch 1회로 조회한다. */
    private Map<UUID, PartnerSummary> resolvePartners(List<DailyClosing> closings) {
        LinkedHashSet<UUID> ids = new LinkedHashSet<>();
        for (DailyClosing closing : closings) {
            if (closing.getPartnerId() != null) {
                ids.add(closing.getPartnerId());
            }
        }
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved = partnerLookupClient.findByPartnerIdsBatch(new ArrayList<>(ids));
        return resolved == null ? Map.of() : resolved;
    }

    private static String partnerCodeOf(PartnerSummary summary) {
        return summary == null ? null : summary.partnerCode();
    }

    private static PartnerSummary partnerSummaryOf(Map<UUID, PartnerSummary> partners, UUID partnerId) {
        return partnerId == null || partners == null || partners.isEmpty() ? null : partners.get(partnerId);
    }

    private static String bizNoDigits(PartnerSummary summary) {
        String bizNo = summary == null ? null : summary.bizNo();
        return bizNo == null ? "" : bizNo.replaceAll("[^0-9]", "");
    }

    private DailyClosing findExisting(LocalDate closingDate, UUID partnerId,
                                      DailyClosingKind closingKind,
                                      DailyClosingSourceKind sourceKind) {
        if (partnerId != null) {
            return dailyClosingRepository
                    .findByClosingDateAndPartnerIdAndClosingKindAndSourceKind(
                            closingDate, partnerId, closingKind, sourceKind)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "일마감이 존재하지 않습니다: " + closingDate));
        }
        return dailyClosingRepository
                .findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(
                        closingDate, closingKind, sourceKind)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "일마감이 존재하지 않습니다: " + closingDate));
    }

    private record AggregationResult(
            BigDecimal totalSupply,
            BigDecimal totalVat,
            BigDecimal totalAmount,
            int slipCount) {
    }
}
