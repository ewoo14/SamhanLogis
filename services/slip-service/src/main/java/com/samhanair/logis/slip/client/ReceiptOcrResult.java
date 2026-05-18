package com.samhanair.logis.slip.client;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Naver Clova OCR 영수증 파싱 결과 — ReceiptOcrClient 단일 반환 타입 (SP-09-3).
 *
 * <p>필드 설명:
 * <ul>
 *   <li>{@code vendorName} — OCR 로 추출된 가게명 (null 가능)</li>
 *   <li>{@code totalAmount} — 총 결제금액 (부가세 포함, null 가능)</li>
 *   <li>{@code vatAmount} — 부가세 금액 (null 가능)</li>
 *   <li>{@code issuedAt} — 영수증 발행일 (null 가능)</li>
 *   <li>{@code rawJson} — OCR 원본 응답 요약 JSON 문자열 (감사 추적용)</li>
 *   <li>{@code success} — 파싱 성공 여부. false 이면 message 에 오류 상세 포함</li>
 *   <li>{@code message} — 성공 시 "OK", 오류 시 오류 메시지</li>
 * </ul>
 *
 * <p><b>UUID 비공개 가드</b>: 본 record 에는 UUID 필드 없음 — 비즈니스 식별자만 노출.
 */
public record ReceiptOcrResult(
        String vendorName,
        BigDecimal totalAmount,
        BigDecimal vatAmount,
        LocalDate issuedAt,
        String rawJson,
        boolean success,
        String message
) {

    /**
     * 성공 결과 정적 factory.
     *
     * @param vendorName  가게명
     * @param totalAmount 총 결제금액
     * @param vatAmount   부가세 금액
     * @param issuedAt    영수증 발행일
     * @param rawJson     OCR 원본 응답 요약 JSON
     * @return success=true ReceiptOcrResult
     */
    public static ReceiptOcrResult success(String vendorName, BigDecimal totalAmount,
                                           BigDecimal vatAmount, LocalDate issuedAt,
                                           String rawJson) {
        return new ReceiptOcrResult(vendorName, totalAmount, vatAmount, issuedAt, rawJson,
                true, "OK");
    }

    /**
     * 실패 결과 정적 factory.
     *
     * @param message 오류 메시지
     * @return success=false ReceiptOcrResult
     */
    public static ReceiptOcrResult failure(String message) {
        return new ReceiptOcrResult(null, null, null, null, null, false, message);
    }
}
