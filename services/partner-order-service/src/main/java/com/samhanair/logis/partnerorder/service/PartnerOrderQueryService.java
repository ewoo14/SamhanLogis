package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderListFilter;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderSummaryResponse;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 주문 목록/상세 조회 서비스.
 *
 * <p>legacy GAS 시트의 날짜/거래처/상태/검색 필터를 자체 DB 조회로 고정한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerOrderQueryService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderQueryService.class);

    private final PartnerOrderRepository partnerOrderRepository;
    private final PartnerSelfScopeGuard partnerSelfScopeGuard;
    private final ProductClient productClient;

    /**
     * 주문 목록을 필터와 페이지 조건으로 조회한다.
     *
     * @param filter legacy 목록 필터
     * @param pageable 페이지 조건
     * @return 사용자 표시값만 포함한 주문 목록
     */
    public Page<PartnerOrderSummaryResponse> list(PartnerOrderListFilter filter, Pageable pageable) {
        return list(filter, pageable, null);
    }

    /**
     * 주문 목록을 조회하되, PARTNER 호출이면 {@code X-Partner-Code} 로 본인 거래처 주문만 강제한다.
     *
     * @param filter legacy 목록 필터
     * @param pageable 페이지 조건
     * @param callerPartnerCode {@code X-Partner-Code}
     * @return 사용자 표시값만 포함한 주문 목록
     */
    public Page<PartnerOrderSummaryResponse> list(
            PartnerOrderListFilter filter, Pageable pageable, String callerPartnerCode) {
        PartnerOrderListFilter normalized = normalize(filter);
        Specification<PartnerOrder> spec = toSpec(normalized);
        String partnerScope = partnerSelfScopeGuard.partnerScopeOrNull(callerPartnerCode);
        if (partnerScope != null) {
            partnerSelfScopeGuard.restrictRequestedPartnerCode(normalized.partnerId(), callerPartnerCode);
            spec = spec.and(ownPartnerSpec(partnerScope));
        }
        return partnerOrderRepository.findAll(spec, pageable)
                .map(PartnerOrderSummaryResponse::from);
    }

    /**
     * 주문번호 또는 내부 UUID 문자열로 단건 상세를 조회한다.
     *
     * <p>내부 영업/관리자 화면은 역할 기반으로 주문 전체를 조회한다. 화면에는 내부 식별자를 표시하지 않는다.
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @return 주문 상세 DTO
     * @throws BusinessException 주문이 없거나 soft-delete 된 경우
     */
    public PartnerOrderDetailResponse findDetailById(String id) {
        return findDetailById(id, null);
    }

    /**
     * 주문번호 또는 내부 UUID 문자열로 단건 상세를 조회한다. PARTNER 호출이면 대상 주문의 거래처 코드와
     * {@code X-Partner-Code} 를 대조한다.
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @param callerPartnerCode {@code X-Partner-Code}
     * @return 주문 상세 DTO
     */
    public PartnerOrderDetailResponse findDetailById(String id, String callerPartnerCode) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        partnerSelfScopeGuard.assertOwnPartner(
                order.getPartnerCode(), callerPartnerCode, "본인 거래처 주문만 조회할 수 있습니다.");
        // Round C #23: 라인 productType("SINGLE"/"BUNDLE") enrich — FE 재고조회 모달(2.6d)이
        // 세트(BUNDLE) 라인을 재고조회 대상에서 제외하기 위함. 신규 DB 컬럼 없이 조회 시점 부착.
        return PartnerOrderDetailResponse.from(order, resolveLineProductTypes(order));
    }

    /**
     * 주문 라인의 {@code modelCode → productType} 매핑을 product-service 조회로 산출한다 (Round B #23).
     *
     * <p>fail-soft — product-service 조회 실패(회로 차단/네트워크/포맷 오류) 시 빈 맵을 반환하여
     * 모든 라인 {@code productType=null} 로 둔다(상세 조회 가용성 우선, 기존 동작 동일). 카탈로그
     * 조회는 {@code productClient} 회로 차단기 fail-soft 정책과 일관한다. direct PUT 라인은
     * synthetic productId 를 저장할 수 있으므로 productId 가 아니라 라인 modelCode snapshot 을 사용한다.
     *
     * @param order 주문 엔티티
     * @return modelCode → productType("SINGLE"/"BUNDLE") 매핑 (조회 실패 시 빈 맵)
     */
    private Map<String, String> resolveLineProductTypes(PartnerOrder order) {
        List<String> modelCodes = order.getLines().stream()
                .map(PartnerOrderLine::getModelName)
                .filter(code -> code != null && !code.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        if (modelCodes.isEmpty()) {
            return Map.of();
        }
        try {
            Map<String, String> result = new HashMap<>();
            for (ProductSummary p : productClient.lookupByModelCodes(modelCodes)) {
                if (p.modelCode() != null && p.productType() != null) {
                    result.put(p.modelCode(), p.productType());
                }
            }
            return result;
        } catch (RuntimeException ex) {
            // fail-soft: 카탈로그 조회 실패해도 상세 조회는 정상 반환(productType 미부착).
            log.warn("주문 상세 productType enrich 실패(fail-soft) orderNo={}: {}",
                    order.getOrderNo(), ex.getMessage());
            return Map.of();
        }
    }

    private PartnerOrderListFilter normalize(PartnerOrderListFilter filter) {
        if (filter == null) {
            return new PartnerOrderListFilter(null, null, null, null, null);
        }
        LocalDate from = filter.dateFrom();
        LocalDate to = filter.dateTo();
        if (from != null && to != null && from.isAfter(to)) {
            return new PartnerOrderListFilter(
                    to,
                    from,
                    trimToNull(filter.partnerId()),
                    filter.status(),
                    trimToNull(filter.searchKeyword()));
        }
        return new PartnerOrderListFilter(
                from,
                to,
                trimToNull(filter.partnerId()),
                filter.status(),
                trimToNull(filter.searchKeyword()));
    }

    /**
     * 목록 필터를 JPA Specification 으로 변환한다.
     *
     * <p>기간 필터(dateFrom/dateTo) 기준 필드 — COALESCE(confirmedAt, createdAt) 통일 (Phase 2.5 Cycle 1 fix):
     * <ul>
     *   <li>CONFIRMED / CONFIRMING / CANCELED → confirmedAt 이 채워져 있으므로 COALESCE 결과 = confirmedAt</li>
     *   <li>DRAFT / ON_HOLD → confirmedAt = null 이므로 COALESCE 결과 = createdAt (fallback)</li>
     *   <li>status = null (전체 조회) → 각 row 에 맞는 날짜가 자동 선택되므로 status 분기 불필요</li>
     * </ul>
     * 기존 preConfirm 분기(CONFIRMING 미포함) 및 status=null 전체조회 DRAFT/ON_HOLD 누락 문제를
     * COALESCE 로 일관 처리하여 해소한다.
     *
     * <p><b>count 쿼리 가드 (Cycle 2c P1-NEW)</b>: Spring Data {@code findAll(Specification, Pageable)} 는
     * 동일 Specification 을 데이터 쿼리와 count 쿼리 양쪽에 적용한다. count 쿼리에 {@code orderBy} 를
     * 포함하면 일부 JPA 구현체(Hibernate 6+)에서 경고·오류가 발생하므로,
     * {@code query.getResultType()} 으로 결과 타입을 확인하여 count 쿼리일 때 정렬을 건너뛴다.
     *
     * @param filter 목록 필터
     * @return JPA Specification
     */
    private Specification<PartnerOrder> toSpec(PartnerOrderListFilter filter) {
        return (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();

            // COALESCE(confirmedAt, createdAt) — status 에 무관하게 의미 있는 날짜를 자동 선택
            Expression<LocalDateTime> effectiveDate =
                    cb.coalesce(root.get("confirmedAt"), root.get("createdAt"));

            if (filter.dateFrom() != null) {
                predicates.add(cb.greaterThanOrEqualTo(
                        effectiveDate,
                        filter.dateFrom().atStartOfDay()));
            }
            if (filter.dateTo() != null) {
                LocalDateTime exclusiveTo = filter.dateTo().plusDays(1).atStartOfDay();
                predicates.add(cb.lessThan(effectiveDate, exclusiveTo));
            }
            if (filter.partnerId() != null) {
                String partner = like(filter.partnerId());
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("partnerCode")), partner),
                        cb.like(cb.lower(root.get("bizCode")), partner)));
            }
            if (filter.status() != null) {
                predicates.add(cb.equal(root.get("status"), filter.status()));
            }
            if (filter.searchKeyword() != null) {
                query.distinct(true);
                Join<PartnerOrder, PartnerOrderLine> line = root.join("lines", JoinType.LEFT);
                String keyword = like(filter.searchKeyword());
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("orderNo")), keyword),
                        cb.like(cb.lower(root.get("partnerCode")), keyword),
                        cb.like(cb.lower(root.get("bizCode")), keyword),
                        cb.like(cb.lower(line.get("productName")), keyword),
                        cb.like(cb.lower(line.get("modelName")), keyword),
                        cb.like(cb.lower(line.get("remark")), keyword)));
            }

            // count 쿼리 가드 — count 쿼리에 orderBy 를 적용하면 Hibernate 6+ 에서 오류/경고 발생.
            // query.getResultType() 이 Long/long 이면 count 쿼리이므로 정렬을 건너뛴다.
            Class<?> resultType = query.getResultType();
            if (resultType != Long.class && resultType != long.class) {
                query.orderBy(cb.desc(
                        cb.coalesce(root.get("confirmedAt"), root.get("createdAt"))));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String like(String value) {
        return "%" + value.trim().toLowerCase(Locale.ROOT) + "%";
    }

    private Specification<PartnerOrder> ownPartnerSpec(String partnerCode) {
        return (root, query, cb) -> cb.equal(root.get("partnerCode"), partnerCode);
    }

}
