package com.samhanair.logis.partnerorder.revision.web.dto;

import com.samhanair.logis.partnerorder.revision.snapshot.PartnerOrderSnapshot;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 거래처 주문 버전이력 단일 스냅샷 상세 응답 DTO (Phase 2.4 Task 7).
 *
 * <p>목록 응답({@link PartnerOrderRevisionResponse})에 추가로 스냅샷 헤더/라인 데이터를 펼쳐 담는다.
 * 복원 대상 revision 의 전체 내용을 FE 가 미리 확인하거나 복원 결과를 확인하는 용도로 사용된다.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}):
 * {@code actorId} 는 미노출. 내부 UUID 식별자(sourceEstimateId 등)는 스냅샷 원본에 포함되어 있으나
 * 본 DTO 는 사용자 표시 필드만 노출한다 — orderNo / partnerCode / bizCode / status / dueDate / memo 등.
 *
 * @param revisionNo       주문별 단조 증가 버전 번호
 * @param revisionType     캡처 유형 (CREATE/EDIT/STATUS/RESTORE)
 * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
 * @param orderNo          주문번호 스냅샷 (표시용)
 * @param actorName        변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
 * @param actorColor       FE userIdToColor 결과 backup (없으면 null)
 * @param createdAt        버전 생성 시각
 * @param snapshot         스냅샷 헤더 + 라인 상세 (사용자 표시 필드만)
 */
public record PartnerOrderRevisionDetailResponse(
        int revisionNo,
        String revisionType,
        Integer sourceRevisionNo,
        String orderNo,
        String actorName,
        String actorColor,
        LocalDateTime createdAt,
        SnapshotView snapshot) {

    /**
     * 스냅샷 헤더 + 라인 사용자 표시 뷰.
     *
     * <p>내부 UUID(sourceEstimateId 등) 는 복원 단계에서만 필요하므로 본 DTO 에서 제외한다.
     *
     * @param partnerCode    거래처 코드
     * @param bizCode        사업자번호
     * @param status         주문 상태 이름 (DRAFT/CONFIRMING/CONFIRMED/CANCELED)
     * @param slipNo         출고전표 번호 (발행 전 null)
     * @param totalAmount    합계
     * @param dueDate        납기일
     * @param memo           요청사항/메모
     * @param lines          라인 목록 스냅샷
     */
    public record SnapshotView(
            String partnerCode,
            String bizCode,
            String status,
            String slipNo,
            BigDecimal totalAmount,
            LocalDate dueDate,
            String memo,
            List<LineView> lines) {
    }

    /**
     * 라인 스냅샷 사용자 표시 뷰.
     *
     * @param modelName   모델명
     * @param productName 상품명
     * @param categoryKey 카테고리 키
     * @param quantity    수량
     * @param priceVat    단가 (VAT 포함)
     * @param subtotal    소계
     * @param remark      비고
     */
    public record LineView(
            String modelName,
            String productName,
            String categoryKey,
            int quantity,
            BigDecimal priceVat,
            BigDecimal subtotal,
            String remark) {
    }

    /**
     * {@link com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision} 과
     * 역직렬화된 {@link PartnerOrderSnapshot} 으로부터 단일 스냅샷 상세 응답을 조립한다.
     *
     * @param revisionNo       버전 번호
     * @param revisionType     캡처 유형 enum name (null 허용)
     * @param sourceRevisionNo RESTORE 출처 (null 허용)
     * @param orderNo          주문번호 스냅샷
     * @param actorName        표시명 (UUID 비공개 가드 적용 후)
     * @param actorColor       FE 색상
     * @param createdAt        생성 시각
     * @param snapshot         역직렬화된 스냅샷
     * @return 단일 스냅샷 상세 응답 DTO
     */
    public static PartnerOrderRevisionDetailResponse of(
            int revisionNo,
            String revisionType,
            Integer sourceRevisionNo,
            String orderNo,
            String actorName,
            String actorColor,
            LocalDateTime createdAt,
            PartnerOrderSnapshot snapshot) {

        List<LineView> lineViews = snapshot.lines() == null ? List.of() :
                snapshot.lines().stream()
                        .map(l -> new LineView(
                                l.modelName(),
                                l.productName(),
                                l.categoryKey(),
                                l.quantity(),
                                l.priceVat(),
                                l.subtotal(),
                                l.remark()))
                        .toList();

        SnapshotView snapshotView = new SnapshotView(
                snapshot.partnerCode(),
                snapshot.bizCode(),
                snapshot.status() == null ? null : snapshot.status().name(),
                snapshot.slipNo(),
                snapshot.totalAmount(),
                snapshot.dueDate(),
                snapshot.memo(),
                lineViews);

        return new PartnerOrderRevisionDetailResponse(
                revisionNo,
                revisionType,
                sourceRevisionNo,
                orderNo,
                actorName,
                actorColor,
                createdAt,
                snapshotView);
    }
}
