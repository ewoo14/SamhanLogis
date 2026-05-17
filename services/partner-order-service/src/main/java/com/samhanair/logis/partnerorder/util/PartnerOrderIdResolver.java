package com.samhanair.logis.partnerorder.util;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import java.util.Optional;
import java.util.UUID;

/**
 * 거래처 주문 사용자 표시 식별자와 내부 UUID 조회 보조 함수.
 *
 * <p>화면은 주문번호만 보유하고, 서버 내부에서는 UUID 를 사용한다. 주문번호의
 * {@code yyyy-MM-dd-n} / {@code yyyy/MM/dd-n} 표기 차이와 UUID fallback 을 한 곳에서 처리한다.
 */
public final class PartnerOrderIdResolver {

    private PartnerOrderIdResolver() {
    }

    /**
     * 주문번호 또는 UUID 문자열로 거래처 주문을 조회한다.
     *
     * @param repository 거래처 주문 repository
     * @param id 주문번호 또는 UUID 문자열
     * @return 조회된 주문
     */
    public static Optional<PartnerOrder> findByIdentifier(PartnerOrderRepository repository, String id) {
        return repository.findByOrderNo(id)
                .or(() -> repository.findByOrderNo(toSlashOrderNo(id)))
                .or(() -> findByUuid(repository, id));
    }

    /**
     * 하이픈 날짜형 주문번호를 legacy 슬래시 날짜형 주문번호로 변환한다.
     *
     * @param value 주문번호 후보
     * @return 변환된 주문번호 후보
     */
    public static String toSlashOrderNo(String value) {
        if (value == null || value.length() < 11) {
            return value;
        }
        if (value.charAt(4) == '-' && value.charAt(7) == '-') {
            return value.substring(0, 4) + "/" + value.substring(5, 7) + "/" + value.substring(8);
        }
        return value;
    }

    /**
     * UUID 문자열이면 내부 ID 로 조회하고, UUID 가 아니면 빈 결과를 반환한다.
     *
     * @param repository 거래처 주문 repository
     * @param value UUID 후보 문자열
     * @return 조회된 주문
     */
    public static Optional<PartnerOrder> findByUuid(PartnerOrderRepository repository, String value) {
        try {
            return repository.findById(UUID.fromString(value));
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }
}
