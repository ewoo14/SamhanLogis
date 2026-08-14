package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * PR-G1 BE (V16) — {@link Slip#applyEcountSchema} 단위 테스트.
 *
 * <p>e-Count schema 12 컬럼 (io_type, time_date, customer_tel/address/representative,
 * shipping_address, inspection_address, receiver_phone, payment_due_label, discount_info,
 * collect_term, agree_term) 가 entity 에 직접 저장되는지 검증.
 *
 * <p>memo 1000자 prepend 정책 폐기 회귀 가드 — applyEcountSchema 호출 후에도 memo 컬럼은
 * 사용자 자유 입력만 보존 (별도 컬럼 직접 저장 패턴).
 */
class SlipEcountSchemaTest {

    private static final UUID SOURCE_WH = UUID.randomUUID();
    private static final UUID DEST_WH = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();

    @Test
    void applyEcountSchema_setsAll12FieldsDirectly_memoUntouched() {
        Slip slip = newOutbound("자유 메모");

        slip.applyEcountSchema(
                "10", "143025",
                "010-1234-5678", "서울 강남구 테헤란로 1", "홍길동",
                "서울 강남구 도착지", "서울 강남구 검수지",
                "010-9999-8888", "익월말", "VIP 5%",
                "월말", "특별 약정");

        assertThat(slip.getIoType()).isEqualTo("10");
        assertThat(slip.getTimeDate()).isEqualTo("143025");
        assertThat(slip.getCustomerTel()).isEqualTo("010-1234-5678");
        assertThat(slip.getCustomerAddress()).isEqualTo("서울 강남구 테헤란로 1");
        assertThat(slip.getCustomerRepresentative()).isEqualTo("홍길동");
        assertThat(slip.getShippingAddress()).isEqualTo("서울 강남구 도착지");
        assertThat(slip.getInspectionAddress()).isEqualTo("서울 강남구 검수지");
        assertThat(slip.getReceiverPhone()).isEqualTo("010-9999-8888");
        assertThat(slip.getPaymentDueLabel()).isEqualTo("익월말");
        assertThat(slip.getDiscountInfo()).isEqualTo("VIP 5%");
        assertThat(slip.getCollectTerm()).isEqualTo("월말");
        assertThat(slip.getAgreeTerm()).isEqualTo("특별 약정");

        // memo 컬럼은 사용자 자유 입력만 보존 — prepend 흔적 없음 (회귀 가드)
        assertThat(slip.getMemo()).isEqualTo("자유 메모");
        assertThat(slip.getMemo()).doesNotContain("배송지:");
        assertThat(slip.getMemo()).doesNotContain("검수지:");
        assertThat(slip.getMemo()).doesNotContain("결제:");
    }

    @Test
    void applyEcountSchema_nullArguments_preserveExistingValues() {
        Slip slip = newOutbound(null);
        // 1차: 모든 값 채움
        slip.applyEcountSchema("10", "100000",
                "010-aaaa", "주소A", "대표A",
                "배송A", "검수A", "010-bbbb", "결제A", "할인A",
                "회수A", "약정A");

        // 2차: null 인자 다수 → 기존 값 보존, non-null 만 갱신
        slip.applyEcountSchema(null, null,
                null, "주소B", null,
                null, null, null, null, null,
                null, null);

        assertThat(slip.getIoType()).isEqualTo("10");
        assertThat(slip.getCustomerTel()).isEqualTo("010-aaaa");
        assertThat(slip.getCustomerAddress()).isEqualTo("주소B"); // 갱신
        assertThat(slip.getCustomerRepresentative()).isEqualTo("대표A");
        assertThat(slip.getShippingAddress()).isEqualTo("배송A");
    }

    @Test
    void applyEcountSchema_inboundIoType_storedAs11() {
        Slip slip = newOutbound(null);
        slip.applyEcountSchema("11", null, null, null, null,
                null, null, null, null, null, null, null);
        assertThat(slip.getIoType()).isEqualTo("11");
    }

    @Test
    void applyEcountSchema_emptyStringStored_notTreatedAsNull() {
        Slip slip = newOutbound(null);
        slip.applyEcountSchema(null, null,
                "", "", "",
                "", "", "", "", "",
                "", "");
        // 빈 문자열은 명시적으로 비움 의도 — null 만 보존, "" 는 저장
        assertThat(slip.getCustomerTel()).isEqualTo("");
        assertThat(slip.getShippingAddress()).isEqualTo("");
    }

    @Test
    void newSlip_defaultEcountFields_areNull() {
        // Slip 신규 생성 직후에는 12 컬럼이 모두 null (DB DEFAULT '10' 은 INSERT 시점에 적용)
        Slip slip = newOutbound("초기 메모");
        assertThat(slip.getIoType()).isNull();
        assertThat(slip.getTimeDate()).isNull();
        assertThat(slip.getCustomerTel()).isNull();
        assertThat(slip.getCustomerAddress()).isNull();
        assertThat(slip.getCustomerRepresentative()).isNull();
        assertThat(slip.getShippingAddress()).isNull();
        assertThat(slip.getInspectionAddress()).isNull();
        assertThat(slip.getReceiverPhone()).isNull();
        assertThat(slip.getPaymentDueLabel()).isNull();
        assertThat(slip.getDiscountInfo()).isNull();
        assertThat(slip.getCollectTerm()).isNull();
        assertThat(slip.getAgreeTerm()).isNull();
    }

    @Test
    void setPartnerCode_storesCodeSnapshot() {
        // V15 보강 — partner_code 직접 snapshot
        Slip slip = newOutbound(null);
        assertThat(slip.getPartnerCode()).isNull();
        slip.setPartnerCode("CUST-2026-0001");
        assertThat(slip.getPartnerCode()).isEqualTo("CUST-2026-0001");
    }

    private Slip newOutbound(String memo) {
        return Slip.createOutbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                SOURCE_WH, DEST_WH, PARTNER, "삼한공조",
                DeliveryTag.SALE, memo, "user-1");
    }
}
