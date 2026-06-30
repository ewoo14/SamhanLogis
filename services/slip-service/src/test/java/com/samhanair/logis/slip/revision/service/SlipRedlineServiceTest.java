package com.samhanair.logis.slip.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** S2d-1 저장 revision 기반 셀 인라인 레드라인 계산 단위 테스트. */
@ExtendWith(MockitoExtension.class)
class SlipRedlineServiceTest {

    private static final UUID FIXED_PARTNER_ID = UUID.randomUUID();
    private static final UUID FIXED_WAREHOUSE_ID = UUID.randomUUID();

    @Mock
    private SlipRepository slipRepository;
    @Mock
    private SlipRevisionRepository revisionRepository;

    @Test
    @DisplayName("anchor 이후 동일 필드 2회 편집은 base+각 편집자 layer 3개로 누적한다")
    void computeRedlineBuildsLayerChainAfterAnchor() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        UUID actor1 = UUID.fromString("20000000-0000-0000-0000-000000000101");
        UUID actor2 = UUID.fromString("20000000-0000-0000-0000-000000000102");
        SlipRevision rev1 = revision(slipId, 1, snapshot("원본", List.of(line(UUID.randomUUID(), 1))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("1차", List.of(line(UUID.randomUUID(), 1))),
                actor1, "김영업", "#3366ff");
        SlipRevision rev3 = revision(slipId, 3, snapshot("2차", List.of(line(UUID.randomUUID(), 1))),
                actor2, "박관리", "#cc4422");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev3, rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        assertThat(response.anchored()).isTrue();
        SlipRedlineResponse.FieldRedline memo = response.fields().stream()
                .filter(field -> field.fieldPath().equals("header.memo"))
                .findFirst()
                .orElseThrow();
        assertThat(memo.label()).isEqualTo("메모");
        assertThat(memo.layers()).extracting(SlipRedlineResponse.Layer::value)
                .containsExactly("원본", "1차", "2차");
        assertThat(memo.layers().get(0).actorName()).isNull();
        assertThat(memo.layers().get(1).actorName()).isEqualTo("김영업");
        assertThat(memo.layers().get(1).actorColor()).isEqualTo("#3366ff");
        assertThat(memo.layers().get(2).actorName()).isEqualTo("박관리");
    }

    @Test
    @DisplayName("anchor 가 없으면 anchored=false 와 빈 fields 를 반환한다")
    void computeRedlineReturnsUnanchoredBeforeThreshold() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = inboundSlip(slipId);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        SlipRedlineResponse response = service().computeRedline(slipId);

        assertThat(response.anchored()).isFalse();
        assertThat(response.fields()).isEmpty();
    }

    @Test
    @DisplayName("actorName 이 UUID 문자열이면 레드라인 응답에도 노출하지 않는다")
    void computeRedlineHidesUuidActorName() throws Exception {
        UUID slipId = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        String uuidName = "20000000-0000-0000-0000-000000000201";
        SlipRevision rev1 = revision(slipId, 1, snapshot("원본", List.of(line(UUID.randomUUID(), 1))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("수정", List.of(line(UUID.randomUUID(), 1))),
                UUID.fromString(uuidName), uuidName, null);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);
        JsonNode json = new ObjectMapper().findAndRegisterModules().valueToTree(response);

        assertThat(json.toString()).doesNotContain(uuidName);
        assertThat(response.fields().get(0).layers().get(1).actorName()).isNull();
    }

    @Test
    @DisplayName("라인 재정렬은 productId 로 매칭해 수정 레드라인을 만들지 않는다")
    void computeRedlineMatchesReorderedLinesByProductId() throws Exception {
        UUID slipId = UUID.randomUUID();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        Slip slip = anchoredSlip(slipId, 1);
        SlipRevision rev1 = revision(slipId, 1, snapshot("memo", List.of(line(first, 1), line(second, 2))));
        SlipRevision rev2 = revision(slipId, 2, snapshot("memo", List.of(line(second, 2), line(first, 1))));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .thenReturn(List.of(rev2, rev1));

        SlipRedlineResponse response = service().computeRedline(slipId);

        assertThat(response.anchored()).isTrue();
        assertThat(response.fields()).isEmpty();
    }

    private SlipRedlineService service() {
        return new SlipRedlineService(slipRepository, revisionRepository,
                new SlipRevisionService(revisionRepository));
    }

    private Slip anchoredSlip(UUID slipId, int anchorRevisionNo) throws Exception {
        Slip slip = inboundSlip(slipId);
        slip.captureRedlineAnchorIfAbsent(anchorRevisionNo);
        return slip;
    }

    private Slip inboundSlip(UUID slipId) throws Exception {
        Slip slip = Slip.createInbound("2026/06/30-1", LocalDate.of(2026, 6, 30), 1,
                FIXED_WAREHOUSE_ID, FIXED_PARTNER_ID, "삼한물산",
                DeliveryTag.RETURN, "memo", "user-1");
        Field id = Slip.class.getDeclaredField("id");
        id.setAccessible(true);
        id.set(slip, slipId);
        return slip;
    }

    private SlipRevision revision(UUID slipId, int revisionNo, SlipSnapshot snapshot) {
        return revision(slipId, revisionNo, snapshot, UUID.randomUUID(), "작성자", null);
    }

    private SlipRevision revision(UUID slipId, int revisionNo, SlipSnapshot snapshot,
                                  UUID actorId, String actorName, String actorColor) {
        return SlipRevision.of(slipId, revisionNo,
                revisionNo == 1 ? SlipRevisionType.CREATE : SlipRevisionType.EDIT,
                null, "2026/06/30-1", LocalDate.of(2026, 6, 30),
                snapshot, actorId, actorName, actorColor);
    }

    private SlipSnapshot snapshot(String memo, List<SlipSnapshot.Line> lines) {
        return new SlipSnapshot("2026/06/30-1", LocalDate.of(2026, 6, 30),
                FIXED_PARTNER_ID, "삼한물산", "P001", "123-45-67890",
                memo, "RETURN", null, null, null, null, null,
                FIXED_WAREHOUSE_ID, "입고창고",
                null, null, null, null, null, null, null, null, null, null,
                lines);
    }

    private SlipSnapshot.Line line(UUID productId, int quantity) {
        return new SlipSnapshot.Line(productId, "품목", "모델", "규격",
                quantity, new BigDecimal("1000"),
                BigDecimal.valueOf(quantity).multiply(new BigDecimal("1000")), null);
    }
}
