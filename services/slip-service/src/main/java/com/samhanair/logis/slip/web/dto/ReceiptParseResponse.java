package com.samhanair.logis.slip.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 영수증 OCR 파싱 + 매입 전표 자동 생성 결과 응답 DTO (SP-09-3).
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility}):
 * 사용자 화면 노출 식별자는 {@code slipNo} (비즈니스 식별자) 만 사용.
 * {@code slipId} (UUID) 는 서버간 internal 호출 또는 FE state 관리 전용.
 *
 * @param slipNo       자동 생성된 매입 전표 번호 ({@code yyyy/MM/dd-N} 형식)
 * @param vendorName   OCR 로 추출된 가게명
 * @param totalAmount  OCR 로 추출된 총 결제금액 (부가세 포함)
 * @param vatAmount    OCR 로 추출된 부가세 금액
 * @param issuedAt     OCR 로 추출된 영수증 발행일
 * @param submitMethod 실제 사용된 OCR 전송 방식 ("DRY_RUN" | "CLOVA")
 * @param parseRawJson OCR 원본 응답 요약 JSON (감사 추적 / DRAFT 검수용)
 */
public record ReceiptParseResponse(
        String slipNo,
        String vendorName,
        BigDecimal totalAmount,
        BigDecimal vatAmount,
        LocalDate issuedAt,
        String submitMethod,
        String parseRawJson
) {
}
