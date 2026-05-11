package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 판매/구매조회 전표 목록 조회 서비스 — V20 (feature/sales-purchase-query-redesign) 신규.
 *
 * <p>기존 {@link SlipService#list} 를 대체하는 전용 서비스 클래스. 주요 변경점:
 * <ul>
 *   <li>날짜 미지정 시 Asia/Seoul 오늘 ±15일 범위 자동 적용</li>
 *   <li>기본 페이지 크기 50</li>
 *   <li>다중 검색 필드 지원 (partnerName / businessNumber / slipNo / projectName /
 *       deliveryAddress — LIKE 매칭)</li>
 *   <li>slipType-deliveryTag 정합 가드 유지</li>
 *   <li>응답 {@link SlipResponse} 에 V20 신규 필드 포함</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: 모든 검색 파라미터는 비즈니스 식별자 (slipNo / partnerCode /
 * businessNumber / projectName) 기준. UUID 파라미터 노출 없음.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SlipQueryService {

    /** 날짜 미지정 시 오늘 기준으로 앞뒤 15일 범위 자동 적용 (총 31일). */
    private static final int DEFAULT_DATE_RANGE_DAYS = 15;

    /** 기본 페이지 크기. */
    public static final int DEFAULT_PAGE_SIZE = 50;

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final SlipRepository slipRepository;

    /**
     * 판매/구매조회 전표 목록 페이지 조회.
     *
     * <p>날짜 범위 기본값 자동 적용:
     * <ul>
     *   <li>{@code dateFrom} / {@code dateTo} 모두 null → Asia/Seoul 오늘 ±15일 범위</li>
     *   <li>한쪽만 null → null 쪽에 자동 범위 경계 적용 (from 만 있으면 to=today+15, 반대도 동일)</li>
     * </ul>
     *
     * <p>검색 파라미터 (모두 선택, null/blank 이면 무시, 부분 일치 LIKE):
     * <ul>
     *   <li>{@code searchPartnerName} — 거래처명</li>
     *   <li>{@code searchPartnerCode} — 거래처코드</li>
     *   <li>{@code searchBusinessNumber} — 사업자등록번호</li>
     *   <li>{@code searchSlipNo} — 전표번호</li>
     *   <li>{@code searchProjectName} — 프로젝트명</li>
     *   <li>{@code searchDeliveryAddress} — 배송주소</li>
     * </ul>
     *
     * @param slipType           전표 유형 (null 이면 전체)
     * @param status             상태 (null 이면 전체)
     * @param dateFrom           조회 시작일 (null 이면 오늘-15일)
     * @param dateTo             조회 종료일 (null 이면 오늘+15일)
     * @param deliveryTags       배송 태그 목록 (null/empty 이면 무시). slipType 정합 불일치 시 400.
     * @param searchPartnerName  거래처명 LIKE 검색 (null 이면 무시)
     * @param searchPartnerCode  거래처코드 LIKE 검색 (null 이면 무시)
     * @param searchBusinessNumber 사업자등록번호 LIKE 검색 (null 이면 무시)
     * @param searchSlipNo       전표번호 LIKE 검색 (null 이면 무시)
     * @param searchProjectName  프로젝트명 LIKE 검색 (null 이면 무시)
     * @param searchDeliveryAddress 배송주소 LIKE 검색 (null 이면 무시)
     * @param pageable           페이지 정보 (size 기본 50 권장 — {@link #defaultPageable()})
     * @return 전표 요약 응답 페이지 (V20 신규 필드 포함)
     * @throws BusinessException(INVALID_INPUT) slipType-deliveryTag 정합 불일치
     */
    public Page<SlipResponse> listForQuery(
            SlipType slipType,
            SlipStatus status,
            LocalDate dateFrom,
            LocalDate dateTo,
            List<DeliveryTag> deliveryTags,
            String searchPartnerName,
            String searchPartnerCode,
            String searchBusinessNumber,
            String searchSlipNo,
            String searchProjectName,
            String searchDeliveryAddress,
            Pageable pageable) {

        // slipType-deliveryTag 정합 가드
        if (slipType != null && deliveryTags != null && !deliveryTags.isEmpty()) {
            for (DeliveryTag tag : deliveryTags) {
                if (tag.getDirection() != slipType) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "deliveryTag=" + tag.name() + " 는 " + tag.getDirection().name()
                                    + " 전표 전용입니다. slipType=" + slipType.name() + " 와 정합되지 않습니다.");
                }
            }
        }

        // 날짜 기본값 적용 (Asia/Seoul 기준 오늘 ±15일)
        LocalDate today = LocalDate.now(KST);
        LocalDate resolvedFrom = (dateFrom != null) ? dateFrom : today.minusDays(DEFAULT_DATE_RANGE_DAYS);
        LocalDate resolvedTo = (dateTo != null) ? dateTo : today.plusDays(DEFAULT_DATE_RANGE_DAYS);

        Specification<Slip> spec = buildQuerySpec(
                slipType, status, resolvedFrom, resolvedTo, deliveryTags,
                searchPartnerName, searchPartnerCode, searchBusinessNumber,
                searchSlipNo, searchProjectName, searchDeliveryAddress);

        return slipRepository.findAll(spec, pageable).map(SlipResponse::from);
    }

    /**
     * 기본 Pageable 생성 — 첫 페이지, 기본 크기 50.
     *
     * @return page=0, size=50 의 Pageable
     */
    public static Pageable defaultPageable() {
        return PageRequest.of(0, DEFAULT_PAGE_SIZE);
    }

    /**
     * 판매/구매조회 전용 동적 Specification 빌더.
     *
     * <p>기존 {@link SlipService#buildListSpec} 에 다중 검색 필드를 추가한 확장 버전.
     * is_deleted=false 명시 predicate 가 포함되어 있다 (SQLRestriction Criteria 보강).
     *
     * @param slipType              전표 유형 필터
     * @param status                상태 필터
     * @param resolvedFrom          날짜 시작 (이미 기본값 적용된 값)
     * @param resolvedTo            날짜 종료 (이미 기본값 적용된 값)
     * @param deliveryTags          배송 태그 IN 필터
     * @param searchPartnerName     거래처명 LIKE
     * @param searchPartnerCode     거래처코드 LIKE
     * @param searchBusinessNumber  사업자등록번호 LIKE
     * @param searchSlipNo          전표번호 LIKE
     * @param searchProjectName     프로젝트명 LIKE
     * @param searchDeliveryAddress 배송주소 LIKE
     * @return 조합된 Specification
     */
    private Specification<Slip> buildQuerySpec(
            SlipType slipType,
            SlipStatus status,
            LocalDate resolvedFrom,
            LocalDate resolvedTo,
            List<DeliveryTag> deliveryTags,
            String searchPartnerName,
            String searchPartnerCode,
            String searchBusinessNumber,
            String searchSlipNo,
            String searchProjectName,
            String searchDeliveryAddress) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            // SQLRestriction 보강 — Criteria query 에서도 명시 가드
            predicates.add(cb.isFalse(root.get("isDeleted")));

            if (slipType != null) {
                predicates.add(cb.equal(root.get("slipType"), slipType));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            // 날짜 범위 (기본값이 이미 적용된 상태)
            predicates.add(cb.between(root.get("slipDate"), resolvedFrom, resolvedTo));

            if (deliveryTags != null && !deliveryTags.isEmpty()) {
                predicates.add(root.get("deliveryTag").in(deliveryTags));
            }

            // 다중 검색 필드 — LIKE (null/blank 이면 무시)
            if (isNotBlank(searchPartnerName)) {
                predicates.add(cb.like(
                        cb.lower(root.get("partnerName")),
                        "%" + searchPartnerName.trim().toLowerCase() + "%"));
            }
            if (isNotBlank(searchPartnerCode)) {
                predicates.add(cb.like(
                        cb.lower(root.get("partnerCode")),
                        "%" + searchPartnerCode.trim().toLowerCase() + "%"));
            }
            if (isNotBlank(searchBusinessNumber)) {
                predicates.add(cb.like(
                        cb.lower(root.get("businessNumber")),
                        "%" + searchBusinessNumber.trim().toLowerCase() + "%"));
            }
            if (isNotBlank(searchSlipNo)) {
                predicates.add(cb.like(
                        cb.lower(root.get("slipNo")),
                        "%" + searchSlipNo.trim().toLowerCase() + "%"));
            }
            if (isNotBlank(searchProjectName)) {
                predicates.add(cb.like(
                        cb.lower(root.get("projectName")),
                        "%" + searchProjectName.trim().toLowerCase() + "%"));
            }
            if (isNotBlank(searchDeliveryAddress)) {
                predicates.add(cb.like(
                        cb.lower(root.get("deliveryAddress")),
                        "%" + searchDeliveryAddress.trim().toLowerCase() + "%"));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private static boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }
}
