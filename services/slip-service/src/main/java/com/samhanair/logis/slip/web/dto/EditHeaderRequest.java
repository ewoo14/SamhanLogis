package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.DeliveryTag;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 전표 헤더 부분 수정 — null 이 아닌 필드만 적용. DRAFT/SAVED 단계에서만 허용.
 *
 * <p>Slice B (notification-slice-B): {@code driverName}, {@code driverPhone} 2 필드 신규 추가
 * — 출고 슬립의 배송 기사 정보. driverPhone 은 한국 휴대폰 패턴 권장 (FE PhoneInput).
 */
public record EditHeaderRequest(
        UUID partnerId,
        @Size(max = 100) String partnerName,
        DeliveryTag deliveryTag,
        @Size(max = 1000) String memo,
        @Size(max = 50) String driverName,
        @Size(max = 20) String driverPhone,
        /**
         * 하차일 N override (nullable) — null 이면 서비스 레이어에서 DeliverySchedule 규칙 자동 계산.
         * 당착(지방 당일 하차) = slipDate 와 동일 값 전달. 지방/야적 태그에만 유효.
         */
        LocalDate unloadDate) {
}
