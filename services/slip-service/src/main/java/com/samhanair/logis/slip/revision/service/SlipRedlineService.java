package com.samhanair.logis.slip.revision.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse.FieldRedline;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse.Layer;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse.FieldChange;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * S2d-1 저장 revision 기반 셀 인라인 레드라인 계산 서비스.
 *
 * <p>임계 전이 시점에 고정한 {@code redline_anchor_revision_no} 이후의
 * {@code slip_revisions} 인접 스냅샷을 S2b fieldChanges 로 비교하고, 필드별 layer 를
 * 오래된 값부터 최신 값까지 누적한다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SlipRedlineService {

    private final SlipRepository slipRepository;
    private final SlipRevisionRepository revisionRepository;
    private final SlipRevisionService revisionService;

    /**
     * 전표의 anchor 이후 누적 레드라인을 계산한다.
     *
     * @param slipId 대상 전표 UUID
     * @return anchor 미존재 시 {@code anchored=false}, 존재 시 변경 필드 layer 목록
     */
    public SlipRedlineResponse computeRedline(UUID slipId) {
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
        Integer anchor = slip.getRedlineAnchorRevisionNo();
        if (anchor == null) {
            return new SlipRedlineResponse(false, List.of());
        }

        List<SlipRevision> revisions = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).stream()
                .filter(revision -> revision.getRevisionNo() != null && revision.getRevisionNo() >= anchor)
                .sorted(Comparator.comparingInt(SlipRevision::getRevisionNo))
                .toList();
        if (revisions.size() <= 1) {
            return new SlipRedlineResponse(true, List.of());
        }

        Map<String, FieldBuilder> fields = new LinkedHashMap<>();
        for (int i = 1; i < revisions.size(); i++) {
            SlipRevision prev = revisions.get(i - 1);
            SlipRevision cur = revisions.get(i);
            String actorName = revisionService.safeActorName(cur.getActorName());
            String actorColor = revisionService.resolveActorColor(cur);
            List<FieldChange> changes = revisionService.fieldChanges(
                    prev.getSnapshot(), cur.getSnapshot(), actorName, actorColor, cur.getCreatedAt());
            for (FieldChange change : changes) {
                // S2d-1: 헤더 필드 한정(안정 fieldPath). 라인 셀(lines[i].*)은 행 인덱스 누적 misattribution
                // (anchor 後 라인 삽입/삭제/재정렬 시 productId 혼입·이력손실) + 단가/합계 snapshot VAT 제외
                // 불일치로 본 슬라이스 redline 비대상. 라인 셀 redline(productId 안정키+VAT 정합)은 S2d-1b 후속.
                if (change.fieldPath().startsWith("lines")) {
                    continue;
                }
                FieldBuilder builder = fields.computeIfAbsent(change.fieldPath(),
                        ignored -> new FieldBuilder(change.fieldPath(), change.label()));
                if (builder.layers.isEmpty()) {
                    builder.layers.add(new Layer(change.beforeValue(), null, null, null));
                }
                builder.layers.add(new Layer(change.afterValue(), change.actorName(),
                        change.actorColor(), change.changedAt()));
            }
        }
        addLineRedlines(revisions, fields);

        List<FieldRedline> result = fields.values().stream()
                .filter(builder -> builder.layers.size() >= 2)
                .map(FieldBuilder::toResponse)
                .toList();
        return new SlipRedlineResponse(true, result);
    }

    private void addLineRedlines(List<SlipRevision> revisions, Map<String, FieldBuilder> fields) {
        if (revisions.size() < 2) {
            return;
        }
        SlipRevision latestRevision = revisions.get(revisions.size() - 1);
        List<SlipSnapshot.Line> latestLines = safeLines(latestRevision.getSnapshot());
        for (int curIdx = 0; curIdx < latestLines.size(); curIdx++) {
            SlipSnapshot.Line curLine = latestLines.get(curIdx);
            UUID productId = curLine.productId();
            if (productId == null) {
                continue;
            }
            int occurrence = occurrenceIndex(latestLines, productId, curIdx);
            for (LineRedlineField field : LineRedlineField.values()) {
                FieldBuilder builder = buildLineField(revisions, curIdx, productId, occurrence, field);
                if (builder.layers.size() >= 2) {
                    fields.put(builder.fieldPath, builder);
                }
            }
        }
    }

    private FieldBuilder buildLineField(List<SlipRevision> revisions, int curIdx, UUID productId,
                                        int occurrence, LineRedlineField field) {
        FieldBuilder builder = new FieldBuilder("lines[" + curIdx + "]." + field.fieldName, field.label);
        String previousValue = null;
        boolean hasPrevious = false;
        for (SlipRevision revision : revisions) {
            SlipSnapshot.Line line = nthByProductId(safeLines(revision.getSnapshot()), productId, occurrence);
            if (line == null) {
                continue;
            }
            String value = formatValue(lineDisplay(field, line));
            if (!hasPrevious) {
                builder.layers.add(new Layer(value, null, null, null));
                previousValue = value;
                hasPrevious = true;
                continue;
            }
            if (!Objects.equals(previousValue, value)) {
                builder.layers.add(new Layer(value,
                        revisionService.safeActorName(revision.getActorName()),
                        revisionService.resolveActorColor(revision),
                        revision.getCreatedAt()));
                previousValue = value;
            }
        }
        return builder;
    }

    private static List<SlipSnapshot.Line> safeLines(SlipSnapshot snapshot) {
        return snapshot == null || snapshot.lines() == null ? List.of() : snapshot.lines();
    }

    private static int occurrenceIndex(List<SlipSnapshot.Line> lines, UUID productId, int curIdx) {
        int occurrence = 0;
        for (int i = 0; i <= curIdx; i++) {
            if (productId.equals(lines.get(i).productId())) {
                occurrence++;
            }
        }
        return occurrence - 1;
    }

    private static SlipSnapshot.Line nthByProductId(List<SlipSnapshot.Line> lines, UUID productId, int occurrence) {
        int seen = 0;
        for (SlipSnapshot.Line line : lines) {
            if (productId.equals(line.productId())) {
                if (seen == occurrence) {
                    return line;
                }
                seen++;
            }
        }
        return null;
    }

    private static String lineDisplay(LineRedlineField field, SlipSnapshot.Line line) {
        return switch (field) {
            case MODEL_NAME -> line.modelName();
            case PRODUCT_NAME -> line.productName();
            case SPECIFICATION -> line.specification();
            case QUANTITY -> String.valueOf(line.quantity());
            // 🚨 단가/합계 표시값은 SlipRevisionService 의 단일 진실원을 쓴다 — 버전이력
            // (fieldChanges)과 이 레드라인이 <b>같은 화면에 나란히</b> 렌더되므로(#937 ⑦),
            // 두 지점이 다른 판정을 하면 사용자는 같은 셀에 대해 두 값을 동시에 본다.
            case UNIT_PRICE -> plain(SlipRevisionService.unitPriceDisplayValue(line));
            case LINE_TOTAL -> plain(SlipRevisionService.lineTotalDisplayValue(line));
        };
    }

    private static String plain(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros().toPlainString();
    }

    private static String formatValue(String value) {
        return value == null || value.trim().isEmpty() ? "비움" : value;
    }

    private enum LineRedlineField {
        MODEL_NAME("modelName", "모델명"),
        PRODUCT_NAME("productName", "품목명"),
        SPECIFICATION("specification", "규격"),
        QUANTITY("quantity", "수량"),
        UNIT_PRICE("unitPrice", "단가"),
        LINE_TOTAL("lineTotal", "합계");

        private final String fieldName;
        private final String label;

        LineRedlineField(String fieldName, String label) {
            this.fieldName = fieldName;
            this.label = label;
        }
    }

    private static final class FieldBuilder {
        private final String fieldPath;
        private final String label;
        private final List<Layer> layers = new ArrayList<>();

        private FieldBuilder(String fieldPath, String label) {
            this.fieldPath = fieldPath;
            this.label = label;
        }

        private FieldRedline toResponse() {
            return new FieldRedline(fieldPath, label, List.copyOf(layers));
        }
    }
}
