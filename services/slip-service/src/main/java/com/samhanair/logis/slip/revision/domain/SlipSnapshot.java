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
 * <p><b>기사/하차 3필드 (R8-BE-5)</b>: {@code driverName}/{@code driverPhone}/{@code unloadDate}
 * 는 R8 신규. {@code SlipService.editDriver} 는 기사 정보 변경을 EDIT 스냅샷으로 캡처하며 그
 * 주석이 <i>"driverName/driverPhone 은 toSnapshot 필드"</i> 라고 <b>명시</b>했으나 record 에
 * 실제로는 없어, 기사 변경이 스냅샷에 담기지 않고 point-in-time 복원이 <b>현재 값을 그대로 남기는</b>
 * 구조 결함이 있었다 (spec §4 "통째 복원" 위반). 셋 다 nullable 이므로 이 키가 없는 <b>구 JSONB
 * 스냅샷도 null 로 안전하게 역직렬화</b>되며(하위호환), null 은 {@code NON_NULL} 정책으로
 * 직렬화에서 생략된다.
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
 * @param driverName 배송 기사명 (R8-BE-5 신규 — 아래 §기사/하차 3필드 참고)
 * @param driverPhone 배송 기사 연락처 (R8-BE-5 신규)
 * @param unloadDate 하차 예정일 (R8-BE-5 신규)
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
        // ---------- 기사/하차 필드 (R8-BE-5) ----------
        // editDriver 의 EDIT 스냅샷이 기사 변경을 담고, 복원이 당시 값으로 되돌리도록 캡처한다.
        String driverName,
        String driverPhone,
        LocalDate unloadDate,
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
     * 기사/하차 3필드 없는 구 시그니처 호환 생성자 (R8-BE-5) — {@link Line} 의 동일 패턴 미러.
     *
     * <p>기사/하차와 무관한 기존 호출처(redline·복원 테스트 픽스처 등)를 위한 편의 생성자다.
     * <b>운영 캡처 경로인 {@code Slip#toSnapshot()} 은 canonical 생성자를 써야 한다</b> — 이 생성자로
     * 회귀하면 기사 변경이 다시 스냅샷에서 누락된다. {@code SlipRevisionSnapshotTest} 의 기사/하차
     * 캡처 단언이 그 회귀를 잡는 가드다.
     */
    public SlipSnapshot(String slipNo, LocalDate slipDate, UUID partnerId, String partnerName,
                        String partnerCode, String businessNumber, String memo, String deliveryTag,
                        String deliveryAddress, String supervisionAddress, String projectName,
                        String recipientPhone, LocalDate paymentDueDate, UUID destinationWarehouseId,
                        String destinationWarehouseName, String shippingAddress,
                        String inspectionAddress, String receiverPhone, String customerTel,
                        String customerAddress, String customerRepresentative, String paymentDueLabel,
                        String discountInfo, String collectTerm, String agreeTerm, List<Line> lines) {
        this(slipNo, slipDate, partnerId, partnerName, partnerCode, businessNumber, memo, deliveryTag,
                deliveryAddress, supervisionAddress, projectName, recipientPhone, paymentDueDate,
                destinationWarehouseId, destinationWarehouseName, null, null, null,
                shippingAddress, inspectionAddress, receiverPhone, customerTel, customerAddress,
                customerRepresentative, paymentDueLabel, discountInfo, collectTerm, agreeTerm, lines);
    }

    /**
     * 전표 라인 1건의 스냅샷.
     *
     * <p>세트 계보 2필드는 R6-H3 신규 — 버전이력/collab 복원 시 세트 구성품이 일반 라인으로
     * 평면화되어 이후 저장마다 배분가가 가격기억(LINE_SAVE)에 각인되는 오염을 막는다.
     * 둘 다 nullable 이므로 계보 필드가 없는 <b>구 JSONB 스냅샷도 null 로 안전하게
     * 역직렬화</b>되며(하위호환), 일반 라인은 {@code NON_NULL} 정책으로 직렬화에서 생략된다.
     *
     * @param productId 제품 UUID (복원용)
     * @param productName 제품명 스냅샷
     * @param modelName 모델명 스냅샷
     * @param specification 규격
     * @param quantity 수량
     * @param unitPrice 단가
     * @param lineTotal 라인 합계 (수량 × 단가)
     * @param note 라인 메모
     * @param unitPriceWithVat VAT 포함 단가
     * @param vatAmount 부가세
     * @param supplyAmount 공급가액
     * @param setHead 세트 전개 그룹 첫 구성품 여부 (R6-H3, head 만 {@code true} — 일반 라인/구
     *        스냅샷은 null, 복원 시 {@code Boolean.TRUE.equals} 로 판정)
     * @param parentSetModel 세트 구성품일 때 부모 세트 modelCode (R6-H3 — 일반 라인/구 스냅샷은 null)
     * @param unitPriceDomain 단가 권위 도메인 enum name (#937 재수렴 6차 A안 —
     *        {@code "VAT_INCLUSIVE"}/{@code "SUPPLY"}, 도메인 컬럼이 없던 legacy 행/구 스냅샷은
     *        null). 버전이력·레드라인의 "단가" 표시값이 화면과 같은 세금 도메인을 말하려면 이
     *        정보가 스냅샷에도 실려야 한다 — 표시 판정이 스냅샷만 보고 이뤄지기 때문이다.
     *        nullable 이므로 이 키가 없는 <b>구 JSONB 스냅샷도 null 로 안전하게 역직렬화</b>되며
     *        (하위호환), null 은 {@code NON_NULL} 정책으로 직렬화에서 생략된다.
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
            String note,
            BigDecimal unitPriceWithVat,
            BigDecimal vatAmount,
            BigDecimal supplyAmount,
            Boolean setHead,
            String parentSetModel,
            String unitPriceDomain) {

        /**
         * 단가 도메인 없는 구 시그니처 호환 생성자 (#937 재수렴 6차) — 세트 계보까지만 쓰는
         * 기존 호출처/테스트 픽스처용. <b>운영 캡처 경로인 {@code Slip#toSnapshot()} 은 canonical
         * 생성자를 써야 한다</b> — 이 생성자로 회귀하면 저장된 도메인이 스냅샷에서 누락되어
         * 버전이력·레드라인이 다시 휴리스틱으로 돌아간다.
         */
        public Line(UUID productId, String productName, String modelName, String specification,
                    int quantity, BigDecimal unitPrice, BigDecimal lineTotal, String note,
                    BigDecimal unitPriceWithVat, BigDecimal vatAmount, BigDecimal supplyAmount,
                    Boolean setHead, String parentSetModel) {
            this(productId, productName, modelName, specification, quantity, unitPrice, lineTotal,
                    note, unitPriceWithVat, vatAmount, supplyAmount, setHead, parentSetModel, null);
        }

        /**
         * 세트 계보 없는 구 시그니처 호환 생성자 — 기존 호출처(테스트 포함)와 계보 무관 라인 생성용.
         */
        public Line(UUID productId, String productName, String modelName, String specification,
                    int quantity, BigDecimal unitPrice, BigDecimal lineTotal, String note,
                    BigDecimal unitPriceWithVat, BigDecimal vatAmount, BigDecimal supplyAmount) {
            this(productId, productName, modelName, specification, quantity, unitPrice, lineTotal,
                    note, unitPriceWithVat, vatAmount, supplyAmount, null, null, null);
        }
    }
}
