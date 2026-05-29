package com.samhanair.logis.slip.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link SlipRevisionService} 스냅샷 캡처 단위 테스트 (권한 재편 Phase 2.1 Task 2).
 *
 * <p>{@code maxRevisionNo+1} 채번 정합 (1 → 2), {@link Slip#toSnapshot()} 매핑된 스냅샷의
 * 라인 수 / slipNo / slipDate 정합을 Mockito mock repository 로 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class SlipRevisionServiceTest {

    @Mock
    private SlipRevisionRepository repository;

    @InjectMocks
    private SlipRevisionService service;

    /**
     * id 가 @GeneratedValue 라 영속화 전엔 null 이므로, 단위 테스트에서는 reflection 으로 주입한다.
     */
    private static void injectId(Slip slip, UUID id) throws Exception {
        Field f = Slip.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(slip, id);
    }

    private Slip sampleSlip(UUID slipId) throws Exception {
        Slip slip = Slip.createOutbound("2026/05/29-3", LocalDate.of(2026, 5, 29), 3,
                UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "삼한물산",
                DeliveryTag.DAY, "긴급 출고", "user-1");
        injectId(slip, slipId);
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "펌프", "MX-100", "220V",
                2, new BigDecimal("15000.00"), "라인메모"));
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "밸브", null, null,
                5, new BigDecimal("3000.00"), null));
        return slip;
    }

    @Test
    @DisplayName("capture 2회 호출 시 revisionNo 가 1 → 2 로 채번되고 스냅샷이 헤더/라인과 정합한다")
    void captureAssignsSequentialRevisionNos() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);
        UUID actorId = UUID.randomUUID();

        // 1회차: 기존 스냅샷 없음 (maxRevisionNo == null → next = 1)
        when(repository.maxRevisionNo(slipId)).thenReturn(null);
        when(repository.save(any(SlipRevision.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipRevision first = service.capture(slip, SlipRevisionType.CREATE, null,
                actorId, "홍길동", null);

        assertThat(first.getRevisionNo()).isEqualTo(1);
        assertThat(first.getRevisionType()).isEqualTo(SlipRevisionType.CREATE);
        assertThat(first.getSlipId()).isEqualTo(slipId);
        assertThat(first.getSlipNo()).isEqualTo("2026/05/29-3");
        assertThat(first.getSlipDate()).isEqualTo(LocalDate.of(2026, 5, 29));
        assertThat(first.getActorId()).isEqualTo(actorId);
        assertThat(first.getActorName()).isEqualTo("홍길동");
        assertThat(first.getSnapshot().lines()).hasSize(2);
        assertThat(first.getSnapshot().partnerName()).isEqualTo("삼한물산");
        assertThat(first.getSnapshot().lines().get(0).lineTotal()).isEqualByComparingTo("30000.00");

        // 2회차: 직전 revision 1 존재 (maxRevisionNo == 1 → next = 2)
        when(repository.maxRevisionNo(slipId)).thenReturn(1);

        SlipRevision second = service.capture(slip, SlipRevisionType.EDIT, null,
                actorId, "홍길동", null);

        assertThat(second.getRevisionNo()).isEqualTo(2);
        assertThat(second.getRevisionType()).isEqualTo(SlipRevisionType.EDIT);
    }

    @Test
    @DisplayName("RESTORE 캡처는 sourceRevisionNo 를 보존한다")
    void captureRestorePreservesSourceRevision() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);

        when(repository.maxRevisionNo(slipId)).thenReturn(3);
        when(repository.save(any(SlipRevision.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipRevision restored = service.capture(slip, SlipRevisionType.RESTORE, 2,
                UUID.randomUUID(), "관리자", null);

        assertThat(restored.getRevisionNo()).isEqualTo(4);
        assertThat(restored.getSourceRevisionNo()).isEqualTo(2);
        assertThat(restored.getRevisionType()).isEqualTo(SlipRevisionType.RESTORE);
    }
}
