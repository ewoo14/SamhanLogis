package com.samhanair.logis.slip.revision.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 전표 full-snapshot 직렬화 DTO (권한 재편 Phase 2.1).
 *
 * <p>{@link com.samhanair.logis.slip.domain.Slip} 헤더 전 필드 + 라인 배열({@link Line})을
 * 한 시점의 불변 스냅샷으로 담는다. {@code slip_revisions.snapshot} (JSONB) 컬럼에
 * Jackson 으로 직렬화/역직렬화된다.
 *
 * <p>JPA 프록시/lazy 연관 직렬화를 회피하기 위해 entity 가 아닌 전용 record 로 분리한다.
 * point-in-time 복원 시 이 스냅샷을 역직렬화해 헤더를 덮어쓰고 라인을 전량 교체한다.
 *
 * <p>UUID 비공개 가드: 화면 표시는 {@code partnerName}/{@code destinationWarehouseName} 등
 * 비즈니스 식별자를 사용하고, UUID 필드는 복원 시 entity 재구성용으로만 보존한다.
 *
 * @param slipNo 전표번호 스냅샷 (YYYY/MM/DD-{seqNo})
 * @param slipDate 전표 날짜
 * @param partnerId 거래처 UUID (복원용)
 * @param partnerName 거래처명 스냅샷
 * @param partnerCode 거래처코드 스냅샷
 * @param businessNumber 사업자등록번호 스냅샷
 * @param memo 메모
 * @param deliveryTag 배송 태그 (enum name 문자열, 미지정 시 null)
 * @param deliveryAddress 배송지 주소
 * @param supervisionAddress 감리지 주소
 * @param projectName 프로젝트명
 * @param recipientPhone 인수자 번호
 * @param paymentDueDate 입금예정일
 * @param destinationWarehouseId 도착지 창고 UUID (복원용)
 * @param destinationWarehouseName 도착지 창고명 스냅샷
 * @param shippingAddress 배송지 주소 (audit overlay 필드, V16)
 * @param inspectionAddress 검수지 주소 (audit overlay 필드, V16)
 * @param receiverPhone 수령자 연락처 (audit overlay 필드, V16)
 * @param customerTel 거래처 연락처 (audit overlay 필드, V16)
 * @param customerAddress 거래처 사업장 주소 (audit overlay 필드, V16)
 * @param customerRepresentative 거래처 대표자명 (audit overlay 필드, V16)
 * @param paymentDueLabel 결제 만기 라벨 (audit overlay 필드, V16)
 * @param discountInfo 할인 정보 (audit overlay 필드, V16)
 * @param collectTerm 대금 회수 조건 (audit overlay 필드, V16)
 * @param agreeTerm 거래 약정 조건 (audit overlay 필드, V16)
 * @param lines 라인 스냅샷 배열
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SlipSnapshot(
        String slipNo,
        LocalDate slipDate,
        UUID partnerId,
        String partnerName,
        String partnerCode,
        String businessNumber,
        String memo,
        String deliveryTag,
        String deliveryAddress,
        String supervisionAddress,
        String projectName,
        String recipientPhone,
        LocalDate paymentDueDate,
        UUID destinationWarehouseId,
        String destinationWarehouseName,
        // ---------- audit overlay 필드 (PR #318 cycle1 P1-1 보강) ----------
        // applyOverlayPatch/readOverlayField 가 편집/조회하는 11개 필드 중 memo 를 제외한 10개.
        // 누락 시 overlay 로 수정된 헤더가 스냅샷에 안 담겨 복원 시 롤백되지 않는다 (spec §4 "통째 복원" 위반).
        String shippingAddress,
        String inspectionAddress,
        String receiverPhone,
        String customerTel,
        String customerAddress,
        String customerRepresentative,
        String paymentDueLabel,
        String discountInfo,
        String collectTerm,
        String agreeTerm,
        List<Line> lines) {

    /**
     * 전표 라인 1건의 스냅샷.
     *
     * @param productId 제품 UUID (복원용)
     * @param productName 제품명 스냅샷
     * @param modelName 모델명 스냅샷
     * @param specification 규격
     * @param quantity 수량
     * @param unitPrice 단가
     * @param lineTotal 라인 합계 (수량 × 단가)
     * @param note 라인 메모
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(
            UUID productId,
            String productName,
            String modelName,
            String specification,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal,
            String note) {
    }
}
