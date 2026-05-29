package com.samhanair.logis.slip.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
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

    /**
     * 메모를 변경하고 라인을 1건 추가한다 (rev2 의 변형 상태 시뮬레이션).
     */
    private void mutateToRev2State(Slip slip) {
        // rev1=memo "긴급 출고" + 라인 2건 → rev2=memo 변경 + 라인 3건
        slip.editHeader(null, null, null, "수정된 메모", null, null);
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "호스", null, null,
                1, new BigDecimal("1000.00"), null));
    }

    @Test
    @DisplayName("restore: rev1(라인2/memo원본) → 변형(라인3/memo변경) → restore(rev1) 시 "
            + "memo·라인이 rev1 로 복원되고 신규 RESTORE revision(source=1) 이 캡처된다")
    void restoreRevertsHeaderAndLinesAndCapturesRestoreRevision() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);
        UUID actorId = UUID.randomUUID();

        // rev1 스냅샷 = 원본 상태 (라인 2건, memo "긴급 출고")
        SlipRevision rev1 = SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                slip.getSlipNo(), slip.getSlipDate(), slip.toSnapshot(),
                actorId, "홍길동", null);

        // 변형 — memo 변경 + 라인 1건 추가 (현 슬립 상태가 라인 3건/memo "수정된 메모" 가 됨)
        mutateToRev2State(slip);
        assertThat(slip.getMemo()).isEqualTo("수정된 메모");
        assertThat(slip.getLines().stream()
                .filter(l -> !Boolean.TRUE.equals(l.getIsDeleted())).count()).isEqualTo(3);

        // restore(rev1) — rev1 스냅샷 로드 + 신규 revisionNo=3 채번
        when(repository.findBySlipIdAndRevisionNo(slipId, 1)).thenReturn(Optional.of(rev1));
        when(repository.maxRevisionNo(slipId)).thenReturn(2);
        when(repository.save(any(SlipRevision.class))).thenAnswer(inv -> inv.getArgument(0));

        SlipRevision restored = service.restore(slip, 1, actorId, "관리자", null);

        // 슬립 헤더/라인이 rev1 로 복원
        assertThat(slip.getMemo()).isEqualTo("긴급 출고");
        assertThat(slip.getLines().stream()
                .filter(l -> !Boolean.TRUE.equals(l.getIsDeleted())).count()).isEqualTo(2);
        // 신규 RESTORE revision: type=RESTORE, source=1, revisionNo=3
        assertThat(restored.getRevisionType()).isEqualTo(SlipRevisionType.RESTORE);
        assertThat(restored.getSourceRevisionNo()).isEqualTo(1);
        assertThat(restored.getRevisionNo()).isEqualTo(3);
        assertThat(restored.getActorName()).isEqualTo("관리자");
        // 캡처된 스냅샷도 복원 후 상태(라인 2건)와 정합
        assertThat(restored.getSnapshot().lines()).hasSize(2);
        assertThat(restored.getSnapshot().memo()).isEqualTo("긴급 출고");
    }

    @Test
    @DisplayName("restore: 대상 revisionNo 가 없으면 NOT_FOUND 를 던진다")
    void restoreThrowsWhenTargetRevisionMissing() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = sampleSlip(slipId);

        when(repository.findBySlipIdAndRevisionNo(slipId, 99)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restore(slip, 99, UUID.randomUUID(), "관리자", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }
}
