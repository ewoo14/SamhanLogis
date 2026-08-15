package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderListFilter;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderSummaryResponse;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
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
    private final EntityManager entityManager;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 주문 목록을 필터와 페이지 조건으로 조회한다 (활성 행 전용).
     *
     * @param filter legacy 목록 필터
     * @param pageable 페이지 조건
     * @return 사용자 표시값만 포함한 주문 목록
     */
    public Page<PartnerOrderSummaryResponse> list(PartnerOrderListFilter filter, Pageable pageable) {
        return list(filter, pageable, null, false);
    }

    /**
     * 주문 목록을 조회하되, PARTNER 호출이면 {@code X-Partner-Code} 로 본인 거래처 주문만 강제한다.
     *
     * <p>{@code includeDeleted} 는 <b>내부(비 X-Is-Partner) 호출 전용</b> opt-in 이다. 이 endpoint 는
     * 내부 직원 데스크톱과 파트너 PWA 셀프서비스가 공유하므로, 파트너 호출은 파라미터 값과 무관하게
     * 활성 행만 반환한다(fail-closed) — 삭제행(is_deleted)과 내부 직원 실명(deleted_by_name)이 외부
     * 파트너에 노출되는 것을 차단한다(#757 R2 HIGH). 거래처 목록
     * {@code PartnerService.searchAdmin} 의 includeDeleted opt-in 패턴 준용.
     *
     * <p>정렬은 서버 고정(확정일 없으면 생성일 DESC, 주문번호 DESC 보조) — {@link Pageable} 의
     * Sort 는 양 경로(native/Specification) 모두에서 무시한다.
     *
     * @param filter legacy 목록 필터
     * @param pageable 페이지 조건 (Sort 무시)
     * @param callerPartnerCode {@code X-Partner-Code}
     * @param includeDeleted true 면 내부 호출 한정으로 soft-delete 행 포함(취소선/복원 표시용)
     * @return 사용자 표시값만 포함한 주문 목록
     */
    public Page<PartnerOrderSummaryResponse> list(
            PartnerOrderListFilter filter, Pageable pageable, String callerPartnerCode, boolean includeDeleted) {
        PartnerOrderListFilter normalized = normalize(filter);
        String partnerScope = partnerSelfScopeGuard.partnerScopeOrNull(callerPartnerCode);
        if (partnerScope != null) {
            // 검증 전용 호출 — 파트너가 타 거래처 partnerId 필터를 요청하면 여기서 throw 한다.
            // 반환값은 의도적으로 폐기한다: 이 분기(partnerScope != null)에서 그 반환값은 항상
            // partnerScope 와 동일하고(requested==null → partnerScope, requested==partnerScope →
            // partnerScope, 그 외엔 이미 throw), 실제 스코프 강제는 별도 경로인
            // listActiveOnly(..., partnerScope) → ownPartnerSpec(partnerScope) 가 담당한다.
            // 이 불변식을 모르고 반환값을 "정리"하면 스코프 강제가 깨질 수 있다(#757 STEP4 BE LOW).
            partnerSelfScopeGuard.restrictRequestedPartnerCode(normalized.partnerId(), callerPartnerCode);
        }
        if (!includeDeleted || partnerScope != null) {
            return listActiveOnly(normalized, pageable, partnerScope);
        }
        return listIncludingDeleted(normalized, pageable, partnerScope);
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
        String partnerName = partnerLookupClient.findByPartnerCode(order.getPartnerCode())
                .map(PartnerSummary::name)
                .orElse(null);
        return PartnerOrderDetailResponse.from(order, resolveLineProductTypes(order), partnerName);
    }

    /**
     * 주문 라인의 {@code modelCode → productType} 매핑을 product-service 조회로 산출한다 (Round B #23).
     *
     * <p>fail-soft — product-service 조회 실패(회로 차단/네트워크/포맷 오류) 시 빈 맵을 반환하여
     * 모든 라인 {@code productType=null} 로 둔다(상세 조회 가용성 우선, 기존 동작 동일). 카탈로그
     * 조회는 {@code productClient} 회로 차단기 fail-soft 정책과 일관한다. 주문 라인의
     * productId 보유 여부와 무관하게 라인 modelCode snapshot 을 사용한다.
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
            return new PartnerOrderListFilter(null, null, null, null, null, null, null, null);
        }
        LocalDate from = filter.dateFrom();
        LocalDate to = filter.dateTo();
        if (from != null && to != null && from.isAfter(to)) {
            return new PartnerOrderListFilter(
                    to,
                    from,
                    trimToNull(filter.partnerId()),
                    trimToNull(filter.partnerCode()),
                    filter.partnerIdExact(),
                    filter.status(),
                    trimToNull(filter.slipPublishStatus()),
                    trimToNull(filter.searchKeyword()));
        }
        return new PartnerOrderListFilter(
                from,
                to,
                trimToNull(filter.partnerId()),
                trimToNull(filter.partnerCode()),
                filter.partnerIdExact(),
                filter.status(),
                trimToNull(filter.slipPublishStatus()),
                trimToNull(filter.searchKeyword()));
    }

    /**
     * 활성 행 전용 목록 조회 — JPA Specification 경로.
     *
     * <p>{@code PartnerOrder} 의 {@code @SQLRestriction("is_deleted = false")} 가 그대로 적용되어
     * soft-delete 행이 결과에 포함될 수 없다. 파트너 셀프서비스 호출(강제)과 includeDeleted 미요청
     * 내부 호출이 사용한다. 정렬은 {@link #toSpec(PartnerOrderListFilter)} 의 서버 고정 정렬을 따른다
     * (Pageable Sort 는 native 경로와의 정합을 위해 의도적으로 제거).
     */
    private Page<PartnerOrderSummaryResponse> listActiveOnly(
            PartnerOrderListFilter filter, Pageable pageable, String partnerScope) {
        Specification<PartnerOrder> spec = toSpec(filter);
        if (partnerScope != null) {
            spec = spec.and(ownPartnerSpec(partnerScope));
        }
        Page<PartnerOrder> page = partnerOrderRepository.findAll(spec, unsorted(pageable));
        Map<String, String> partnerNames = resolvePartnerNames(page.getContent());
        return page.map(order -> PartnerOrderSummaryResponse.from(order, partnerNames.get(order.getPartnerCode())));
    }

    /** Pageable 의 Sort 를 제거한다 — 정렬은 서버 고정(양 조회 경로 정합). */
    private Pageable unsorted(Pageable pageable) {
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }

    /**
     * 목록 화면 전용 조회. PartnerOrder 엔티티의 {@code @SQLRestriction("is_deleted = false")} 를
     * 우회해야 삭제행을 취소선/복원 대상으로 표시할 수 있으므로 native query 로만 수행한다.
     *
     * <p>내부(비파트너) + includeDeleted=true 호출 전용 — 파트너 스코프 게이트는
     * {@link #list(PartnerOrderListFilter, Pageable, String, boolean)} 에서 강제된다.
     */
    private Page<PartnerOrderSummaryResponse> listIncludingDeleted(
            PartnerOrderListFilter filter, Pageable pageable, String partnerScope) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = buildNativeWhereClause(filter, partnerScope, params);
        String orderBy = " ORDER BY COALESCE(po.confirmed_at, po.created_at) DESC, po.order_no DESC";

        Query countQuery = entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM partner_orders po WHERE " + where);
        params.forEach(countQuery::setParameter);
        long total = ((Number) countQuery.getSingleResult()).longValue();
        if (total == 0) {
            return new PageImpl<>(List.of(), pageable, 0);
        }

        Query dataQuery = entityManager.createNativeQuery(
                "SELECT * FROM partner_orders po WHERE " + where + orderBy,
                PartnerOrder.class);
        params.forEach(dataQuery::setParameter);
        dataQuery.setFirstResult((int) pageable.getOffset());
        dataQuery.setMaxResults(pageable.getPageSize());

        @SuppressWarnings("unchecked")
        List<PartnerOrder> rows = dataQuery.getResultList();
        Map<String, String> partnerNames = resolvePartnerNames(rows);
        return new PageImpl<>(
                rows.stream().map(order -> PartnerOrderSummaryResponse.from(order, partnerNames.get(order.getPartnerCode()))).toList(),
                pageable,
                total);
    }

    /** 목록 페이지의 고유 거래처 코드만 partner-service에서 조회한다. 장애 시 코드 폴백을 유지한다. */
    private Map<String, String> resolvePartnerNames(List<PartnerOrder> orders) {
        Map<String, String> names = new HashMap<>();
        orders.stream().map(PartnerOrder::getPartnerCode).filter(code -> code != null && !code.isBlank())
                .distinct().forEach(code -> partnerLookupClient.findByPartnerCode(code)
                        .map(PartnerSummary::name).filter(name -> name != null && !name.isBlank())
                        .ifPresent(name -> names.put(code, name)));
        return names;
    }

    private String buildNativeWhereClause(
            PartnerOrderListFilter filter, String partnerScope, Map<String, Object> params) {
        List<String> predicates = new ArrayList<>();
        predicates.add("1 = 1");
        if (filter.dateFrom() != null) {
            predicates.add("COALESCE(po.confirmed_at, po.created_at) >= :dateFrom");
            params.put("dateFrom", filter.dateFrom().atStartOfDay());
        }
        if (filter.dateTo() != null) {
            predicates.add("COALESCE(po.confirmed_at, po.created_at) < :dateTo");
            params.put("dateTo", filter.dateTo().plusDays(1).atStartOfDay());
        }
        if (filter.partnerId() != null) {
            predicates.add("(LOWER(po.partner_code) LIKE :partnerId ESCAPE E'\\\\'"
                    + " OR LOWER(po.biz_code) LIKE :partnerId ESCAPE E'\\\\')");
            params.put("partnerId", like(filter.partnerId()));
        }
        if (filter.partnerCode() != null) {
            predicates.add("po.partner_code = :partnerCode");
            params.put("partnerCode", filter.partnerCode());
        }
        if (filter.partnerIdExact() != null) {
            // 병합 후보 조회는 선택 UUID와 일치하는 신규 주문뿐 아니라, 같은 partnerCode의
            // legacy(NULL) 주문도 함께 내려야 FE가 fail-closed 사유와 단건 발행 대안을 고지할 수 있다.
            // 다른 UUID가 이미 저장된 주문은 계속 제외해 동일 코드 재사용 오귀속을 막는다.
            predicates.add(filter.partnerCode() != null
                    ? "(po.partner_id = :partnerIdExact OR po.partner_id IS NULL)"
                    : "po.partner_id = :partnerIdExact");
            params.put("partnerIdExact", filter.partnerIdExact());
        }
        if (filter.status() != null) {
            predicates.add("po.status = :status");
            params.put("status", filter.status().name());
        }
        if (filter.slipPublishStatus() != null) {
            if ("FAILED".equals(filter.slipPublishStatus())) {
                predicates.add("po.slip_publish_status = 'FAILED_PERMANENT'");
            } else {
                predicates.add("po.slip_publish_status = :slipPublishStatus");
                params.put("slipPublishStatus", filter.slipPublishStatus());
            }
        }
        if (filter.searchKeyword() != null) {
            predicates.add("""
                    (
                        LOWER(po.order_no) LIKE :searchKeyword ESCAPE E'\\\\'
                        OR LOWER(po.partner_code) LIKE :searchKeyword ESCAPE E'\\\\'
                        OR LOWER(po.biz_code) LIKE :searchKeyword ESCAPE E'\\\\'
                        OR EXISTS (
                            SELECT 1
                            FROM partner_order_lines pol
                            WHERE pol.partner_order_id = po.id
                              AND (
                                  LOWER(pol.product_name) LIKE :searchKeyword ESCAPE E'\\\\'
                                  OR LOWER(pol.model_name) LIKE :searchKeyword ESCAPE E'\\\\'
                                  OR LOWER(pol.remark) LIKE :searchKeyword ESCAPE E'\\\\'
                              )
                        )
                    )
                    """);
            params.put("searchKeyword", like(filter.searchKeyword()));
        }
        if (partnerScope != null) {
            predicates.add("po.partner_code = :partnerScope");
            params.put("partnerScope", partnerScope);
        }
        return String.join(" AND ", predicates);
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
                        cb.like(cb.lower(root.get("partnerCode")), partner, '\\'),
                        cb.like(cb.lower(root.get("bizCode")), partner, '\\')));
            }
            if (filter.partnerCode() != null) {
                predicates.add(cb.equal(root.get("partnerCode"), filter.partnerCode()));
            }
            if (filter.partnerIdExact() != null) {
                Predicate exactPartner = cb.equal(root.get("partnerId"), filter.partnerIdExact());
                predicates.add(filter.partnerCode() != null
                        ? cb.or(exactPartner, cb.isNull(root.get("partnerId")))
                        : exactPartner);
            }
            if (filter.status() != null) {
                predicates.add(cb.equal(root.get("status"), filter.status()));
            }
            if (filter.slipPublishStatus() != null) {
                String publishStatus = filter.slipPublishStatus();
                if ("FAILED".equals(publishStatus)) {
                    predicates.add(cb.equal(root.get("slipPublishStatus"),
                            com.samhanair.logis.partnerorder.domain.SlipPublishStatus.FAILED_PERMANENT));
                } else {
                    try {
                        predicates.add(cb.equal(root.get("slipPublishStatus"),
                                com.samhanair.logis.partnerorder.domain.SlipPublishStatus.valueOf(publishStatus)));
                    } catch (IllegalArgumentException ex) {
                        predicates.add(cb.disjunction());
                    }
                }
            }
            if (filter.searchKeyword() != null) {
                String keyword = like(filter.searchKeyword());
                // 라인 검색 = EXISTS 서브쿼리 — native 경로와 동일 의미. 구 LEFT JOIN + distinct 조합은
                // PostgreSQL "SELECT DISTINCT 의 ORDER BY 표현식은 select 목록에 있어야 함" 제약과
                // 충돌한다(스펙 자체 COALESCE 정렬이 적용되는 활성 경로에서 500 — #757 R2 fix에서 실측).
                var lineExists = query.subquery(Integer.class);
                var line = lineExists.from(PartnerOrderLine.class);
                lineExists.select(cb.literal(1)).where(
                        cb.equal(line.get("partnerOrder"), root),
                        cb.or(
                                cb.like(cb.lower(line.get("productName")), keyword, '\\'),
                                cb.like(cb.lower(line.get("modelName")), keyword, '\\'),
                                cb.like(cb.lower(line.get("remark")), keyword, '\\')));
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("orderNo")), keyword, '\\'),
                        cb.like(cb.lower(root.get("partnerCode")), keyword, '\\'),
                        cb.like(cb.lower(root.get("bizCode")), keyword, '\\'),
                        cb.exists(lineExists)));
            }

            // count 쿼리 가드 — count 쿼리에 orderBy 를 적용하면 Hibernate 6+ 에서 오류/경고 발생.
            // query.getResultType() 이 Long/long 이면 count 쿼리이므로 정렬을 건너뛴다.
            Class<?> resultType = query.getResultType();
            if (resultType != Long.class && resultType != long.class) {
                // 보조 정렬 orderNo DESC — native 경로(listIncludingDeleted)의
                // "ORDER BY COALESCE(...) DESC, po.order_no DESC" 와 결정적 순서 정합.
                query.orderBy(
                        cb.desc(cb.coalesce(root.get("confirmedAt"), root.get("createdAt"))),
                        cb.desc(root.get("orderNo")));
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
        return "%" + escapeLikeLiteral(value.trim().toLowerCase(Locale.ROOT)) + "%";
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private Specification<PartnerOrder> ownPartnerSpec(String partnerCode) {
        return (root, query, cb) -> cb.equal(root.get("partnerCode"), partnerCode);
    }

}
