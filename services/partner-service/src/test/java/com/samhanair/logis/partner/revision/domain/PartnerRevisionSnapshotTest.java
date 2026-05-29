package com.samhanair.logis.partner.revision.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.partner.domain.PartnerStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link PartnerRevision} factory 검증 + {@link PartnerSnapshot} Jackson round-trip 단위 테스트
 * (권한 재편 Phase 2.3 Task 1).
 *
 * <p>JSONB 컬럼에 저장될 스냅샷 DTO 가 거래처 헤더(LocalDate/UUID/enum 포함) + 4탭 자식
 * (단가/배송지/담당자 배열)을 무손실 직렬화/역직렬화하는지, factory 가 필수 인자를 강제하는지 확인한다.
 *
 * <p>{@code EstimateRevisionSnapshotTest} 미러.
 */
class PartnerRevisionSnapshotTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    private PartnerSnapshot fullSnapshot() {
        return new PartnerSnapshot(
                "P-2026-0001",
                "123-45-67890",
                "삼한물산",
                "서울시 강남구 1",
                "02-1234-5678",
                new BigDecimal("10000000.00"),
                new BigDecimal("2500000.00"),
                PartnerStatus.ACTIVE,
                "0001",
                "홍대표",
                "도소매",
                "공조설비",
                "02-1234-5679",
                "rep@samhan.co.kr",
                "tax@samhan.co.kr",
                "010-1111-2222",
                "06234",
                "서울시 강남구 본사 1",
                "10540",
                "경기도 고양시 물류 2",
                "삼한물산 123-45-67890 02-1234-5678",
                "VIP거래처",
                "수도권",
                "https://samhan.co.kr",
                "KRW",
                Boolean.TRUE,
                "DOMESTIC",
                "DOMESTIC",
                "MANUAL",
                "MANUAL",
                new BigDecimal("0.0300"),
                new BigDecimal("0.0200"),
                "VIP단가",
                "기본구매단가",
                60,
                45,
                LocalDate.of(2020, 3, 15),
                "등록",
                "엘케이토탈 개인고객",
                "이성미",
                new PartnerSnapshot.PriceDiscount(new BigDecimal("12.50"), 30, "VIP 12.5% 할인"),
                List.of(
                        new PartnerSnapshot.ShippingAddress("본사창고", "06234", "서울시 강남구 본사 1",
                                "02-1234-5678", "김수령", Boolean.TRUE, "정문 하차"),
                        new PartnerSnapshot.ShippingAddress(null, null, "경기도 고양시 물류 2",
                                null, null, Boolean.FALSE, null)),
                List.of(
                        new PartnerSnapshot.Contact("장영구", "이사", "010-3333-4444",
                                "jang@samhan.co.kr", Boolean.TRUE, "결재 담당"),
                        new PartnerSnapshot.Contact("김미선", null, null, null, Boolean.FALSE, null)));
    }

    @Test
    @DisplayName("PartnerSnapshot 은 헤더+단가+배송지+담당자를 Jackson round-trip 무손실 직렬화한다")
    void snapshotJacksonRoundTrip() throws Exception {
        PartnerSnapshot original = fullSnapshot();

        String json = objectMapper.writeValueAsString(original);
        PartnerSnapshot restored = objectMapper.readValue(json, PartnerSnapshot.class);

        assertThat(restored).isEqualTo(original);
        assertThat(restored.status()).isEqualTo(PartnerStatus.ACTIVE);
        assertThat(restored.registrationDate()).isEqualTo(LocalDate.of(2020, 3, 15));
        assertThat(restored.creditLimit()).isEqualByComparingTo("10000000.00");
        assertThat(restored.outboundAdjustmentRate()).isEqualByComparingTo("0.0300");
        assertThat(restored.priceDiscount()).isNotNull();
        assertThat(restored.priceDiscount().basicDiscountRate()).isEqualByComparingTo("12.50");
        assertThat(restored.priceDiscount().paymentTermDays()).isEqualTo(30);
        assertThat(restored.shippingAddresses()).hasSize(2);
        assertThat(restored.shippingAddresses().get(0).isDefault()).isTrue();
        assertThat(restored.shippingAddresses().get(0).alias()).isEqualTo("본사창고");
        assertThat(restored.contacts()).hasSize(2);
        assertThat(restored.contacts().get(0).contactName()).isEqualTo("장영구");
        assertThat(restored.contacts().get(0).isPrimary()).isTrue();
    }

    @Test
    @DisplayName("PartnerSnapshot 은 자식 없는(priceDiscount null + 빈 배열) 거래처도 무손실 직렬화한다")
    void snapshotWithoutChildrenRoundTrip() throws Exception {
        PartnerSnapshot original = new PartnerSnapshot(
                "P-2026-0002", "999-88-77777", "신규거래처", null, null,
                BigDecimal.ZERO, BigDecimal.ZERO, PartnerStatus.ACTIVE,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, List.of(), List.of());

        String json = objectMapper.writeValueAsString(original);
        PartnerSnapshot restored = objectMapper.readValue(json, PartnerSnapshot.class);

        assertThat(restored).isEqualTo(original);
        assertThat(restored.priceDiscount()).isNull();
        assertThat(restored.shippingAddresses()).isEmpty();
        assertThat(restored.contacts()).isEmpty();
    }

    @Test
    @DisplayName("PartnerRevision.of 는 RESTORE 스냅샷을 생성하고 source revision 을 보존한다")
    void factoryCreatesRestoreRevision() {
        UUID partnerId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        PartnerSnapshot snapshot = fullSnapshot();

        PartnerRevision revision = PartnerRevision.of(partnerId, 4, PartnerRevisionType.RESTORE,
                2, "P-2026-0001", snapshot, actorId, "홍길동", "#3366FF");

        assertThat(revision.getPartnerId()).isEqualTo(partnerId);
        assertThat(revision.getRevisionNo()).isEqualTo(4);
        assertThat(revision.getRevisionType()).isEqualTo(PartnerRevisionType.RESTORE);
        assertThat(revision.getSourceRevisionNo()).isEqualTo(2);
        assertThat(revision.getPartnerCode()).isEqualTo("P-2026-0001");
        assertThat(revision.getActorName()).isEqualTo("홍길동");
        assertThat(revision.getActorColor()).isEqualTo("#3366FF");
        assertThat(revision.getSnapshot()).isEqualTo(snapshot);
    }

    @Test
    @DisplayName("PartnerRevision.of 는 필수 인자(partnerId/revisionNo/revisionType/snapshot) 누락 시 거부한다")
    void factoryRejectsMissingRequiredArgs() {
        PartnerSnapshot snapshot = fullSnapshot();
        UUID partnerId = UUID.randomUUID();

        assertThatThrownBy(() -> PartnerRevision.of(null, 1, PartnerRevisionType.CREATE, null,
                null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PartnerRevision.of(partnerId, null, PartnerRevisionType.CREATE,
                null, null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PartnerRevision.of(partnerId, 1, null, null,
                null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PartnerRevision.of(partnerId, 1, PartnerRevisionType.CREATE,
                null, null, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
