package com.samhanair.logis.slip.delivery.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * DeliveryBatch 도메인 — 라이프사이클 5 시나리오 (Plan §3.3).
 *
 * <ol>
 *   <li>create — batchToken 생성, expiresAt = batchDate + 1일 23:59:59</li>
 *   <li>markSmsSent — smsSentAt 기록, 재호출 시 CONFLICT</li>
 *   <li>markSmsFailed — smsLastError 기록, 500자 truncate</li>
 *   <li>addSlip — slip.deliveryBatchId 갱신</li>
 *   <li>removeSlip — slip.deliveryBatchId = null</li>
 * </ol>
 */
class DeliveryBatchTest {

    private static final UUID SOURCE_WH = UUID.randomUUID();
    private static final UUID DEST_WH = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();
    // 시간 의존 회귀 회피 — 항상 오늘 날짜 사용 (PR #94 fix, 2026-05-05 하드코딩 → 만료)
    private static final LocalDate BATCH_DATE = LocalDate.now();

    @Test
    void create_setsTokenAndExpiry() {
        DeliveryBatch batch = DeliveryBatch.create(
                "김기사", "010-1234-5678", BATCH_DATE, List.of());

        assertThat(batch.getDriverName()).isEqualTo("김기사");
        assertThat(batch.getDriverPhone()).isEqualTo("010-1234-5678");
        assertThat(batch.getBatchDate()).isEqualTo(BATCH_DATE);
        assertThat(batch.getBatchToken()).isNotBlank();
        // base64url(48 bytes) = 64자
        assertThat(batch.getBatchToken().length()).isEqualTo(64);
        assertThat(batch.getTokenExpiresAt())
                .isEqualTo(BATCH_DATE.plusDays(1).atTime(23, 59, 59));
        assertThat(batch.getSmsSentAt()).isNull();
        assertThat(batch.getSmsLastError()).isNull();
        assertThat(batch.isSent()).isFalse();
        assertThat(batch.isExpired()).isFalse();  // 미래 날짜
    }

    @Test
    void create_blankDriverName_throws() {
        assertThatThrownBy(() -> DeliveryBatch.create("", "010-1111-2222", BATCH_DATE, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("driverName");
    }

    @Test
    void create_blankDriverPhone_throws() {
        assertThatThrownBy(() -> DeliveryBatch.create("기사", "  ", BATCH_DATE, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("driverPhone");
    }

    @Test
    void create_nullBatchDate_throws() {
        assertThatThrownBy(() -> DeliveryBatch.create("기사", "010-1111-2222", null, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("batchDate");
    }

    @Test
    void markSmsSent_setsTimestamp_andClearsError() {
        DeliveryBatch batch = newBatch();
        batch.markSmsFailed("이전 에러");

        batch.markSmsSent();

        assertThat(batch.getSmsSentAt()).isNotNull();
        assertThat(batch.getSmsLastError()).isNull();
        assertThat(batch.isSent()).isTrue();
    }

    @Test
    void markSmsSent_alreadySent_throwsConflict() {
        DeliveryBatch batch = newBatch();
        batch.markSmsSent();

        assertThatThrownBy(batch::markSmsSent)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void markSmsFailed_recordsError() {
        DeliveryBatch batch = newBatch();
        batch.markSmsFailed("Aligo 4xx");

        assertThat(batch.getSmsLastError()).isEqualTo("Aligo 4xx");
        assertThat(batch.getSmsSentAt()).isNull();  // 실패는 sent 표시 X
    }

    @Test
    void markSmsFailed_truncatesAt500Chars() {
        DeliveryBatch batch = newBatch();
        String longError = "X".repeat(600);
        batch.markSmsFailed(longError);

        assertThat(batch.getSmsLastError()).hasSize(500);
    }

    @Test
    void addSlip_assignsBatchIdToSlip() {
        DeliveryBatch batch = newBatch();
        UUID batchId = UUID.randomUUID();
        ReflectionTestUtils.setField(batch, "id", batchId);
        Slip slip = newSlip();

        batch.addSlip(slip);

        assertThat(slip.getDeliveryBatchId()).isEqualTo(batchId);
    }

    @Test
    void removeSlip_clearsBatchIdOnSlip() {
        DeliveryBatch batch = newBatch();
        UUID batchId = UUID.randomUUID();
        ReflectionTestUtils.setField(batch, "id", batchId);
        Slip slip = newSlip();
        batch.addSlip(slip);
        assertThat(slip.getDeliveryBatchId()).isEqualTo(batchId);

        batch.removeSlip(slip);

        assertThat(slip.getDeliveryBatchId()).isNull();
    }

    @Test
    void addSlip_nullSlip_isNoOp() {
        DeliveryBatch batch = newBatch();
        // null slip 허용 — 단순 no-op
        batch.addSlip(null);
        batch.removeSlip(null);
    }

    @Test
    void create_withSlips_assignsAllSlips() {
        Slip s1 = newSlip();
        Slip s2 = newSlip();

        DeliveryBatch batch = DeliveryBatch.create(
                "박기사", "010-9999-8888", BATCH_DATE, List.of(s1, s2));
        UUID batchId = UUID.randomUUID();
        ReflectionTestUtils.setField(batch, "id", batchId);
        // create 시점엔 batch.id 가 null 이므로 addSlip 후 다시 적용 필요
        batch.addSlip(s1);
        batch.addSlip(s2);

        assertThat(s1.getDeliveryBatchId()).isEqualTo(batchId);
        assertThat(s2.getDeliveryBatchId()).isEqualTo(batchId);
    }

    @Test
    void regenerateToken_replacesTokenAndResetsSent() {
        DeliveryBatch batch = newBatch();
        String original = batch.getBatchToken();
        batch.markSmsSent();

        batch.regenerateToken();

        assertThat(batch.getBatchToken()).isNotEqualTo(original);
        assertThat(batch.getBatchToken().length()).isEqualTo(64);
        assertThat(batch.getSmsSentAt()).isNull();
        assertThat(batch.getSmsLastError()).isNull();
    }

    @Test
    void isExpired_pastBatchDate_returnsTrue() {
        // batchDate 가 어제라면 expiresAt 도 오늘 23:59:59 — 다음날 호출 시 만료
        DeliveryBatch batch = DeliveryBatch.create(
                "기사", "010-1111-2222", LocalDate.now().minusDays(3), List.of());

        assertThat(batch.isExpired()).isTrue();
    }

    private DeliveryBatch newBatch() {
        return DeliveryBatch.create("기사", "010-1234-5678", BATCH_DATE, List.of());
    }

    private Slip newSlip() {
        return Slip.createOutbound("2026/05/05-001", BATCH_DATE, 1,
                SOURCE_WH, DEST_WH, PARTNER, "거래처",
                DeliveryTag.SALE, "메모", "user-1");
    }
}
