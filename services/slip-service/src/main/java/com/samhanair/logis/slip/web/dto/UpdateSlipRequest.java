package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.DeliveryTag;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 전표 헤더 + V20 프로젝트 정보 통합 수정 요청 — null 이 아닌 필드만 적용 (부분 갱신).
 *
 * <p>DRAFT/SAVED 단계에서만 허용. 기존 {@link EditHeaderRequest} 의 6 필드에 V20 신규 5 필드를
 * 추가한 확장 DTO. FE 슬립 작성/수정 폼의 V20 신규 컬럼 입력 → persist 경로에 사용.
 *
 * <p>V20 신규 5 필드:
 * <ul>
 *   <li>{@code deliveryAddress} — 배송주소 (실제 인수 현장, max 500).</li>
 *   <li>{@code supervisionAddress} — 감리주소 (실제 설치 현장, max 500).</li>
 *   <li>{@code projectName} — 프로젝트명 (max 200).</li>
 *   <li>{@code recipientPhone} — 인수자 번호 (max 20, 숫자·하이픈만 허용).</li>
 *   <li>{@code paymentDueDate} — 입금예정일 (LocalDate).</li>
 * </ul>
 *
 * <p>{@code businessNumber} 는 사용자 직접 입력 대상이 아님 — 서비스 레이어에서
 * partner-service Feign 을 통해 {@code partnerId} → {@code bizNo} 자동 resolve.
 *
 * @param partnerId 거래처 UUID (null 이면 보존)
 * @param partnerName 거래처명 snapshot (null 이면 보존)
 * @param deliveryTag 배송 태그 (null 이면 보존)
 * @param memo 메모 (null 이면 보존)
 * @param driverName 배송 기사명 (null 이면 보존)
 * @param driverPhone 배송 기사 연락처 (null 이면 보존)
 * @param deliveryAddress 배송주소 — 실제 인수 현장 (null 이면 보존)
 * @param supervisionAddress 감리주소 — 실제 설치 현장 (null 이면 보존)
 * @param projectName 프로젝트명 (null 이면 보존)
 * @param recipientPhone 인수자 번호 (null 이면 보존, 숫자·하이픈만 허용)
 * @param paymentDueDate 입금예정일 (null 이면 보존)
 */
public record UpdateSlipRequest(
        UUID partnerId,
        @Size(max = 100) String partnerName,
        DeliveryTag deliveryTag,
        @Size(max = 1000) String memo,
        @Size(max = 50) String driverName,
        @Size(max = 20) String driverPhone,
        // V20 신규 5 필드 — 판매/구매조회 화면 매칭
        /** 배송주소 — 실제 인수 현장 주소 (shippingAddress V16 와 별도). */
        @Size(max = 500) String deliveryAddress,
        /** 감리주소 — 실제 설치 및 감리가 이루어지는 현장 주소. */
        @Size(max = 500) String supervisionAddress,
        /** 프로젝트명 — 복수 전표를 동일 프로젝트로 묶기 위한 분류 키. */
        @Size(max = 200) String projectName,
        /** 인수자 번호 — 현장 담당자 직접 연락처 (숫자 및 하이픈만 허용). */
        @Size(max = 20) @Pattern(regexp = "^[0-9-]*$", message = "인수자 번호는 숫자와 하이픈만 허용합니다") String recipientPhone,
        /** 입금예정일 — 정형 DATE. 회계 기간 매칭 / 미수금 관리에 활용. */
        LocalDate paymentDueDate,
        /**
         * 하차일 N override (nullable) — null 이면 서비스 레이어에서 DeliverySchedule 규칙 자동 계산.
         * 당착(지방 당일 하차) = slipDate 와 동일 값 전달. 지방/야적 태그에만 유효.
         */
        LocalDate unloadDate) {
}
