package com.samhanair.logis.slip.revision.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.financial.VatAmountCalculator;
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
            case UNIT_PRICE -> plain(unitPriceDisplayValue(line));
            case LINE_TOTAL -> plain(lineTotalDisplayValue(line));
        };
    }

    /**
     * 레드라인 "단가" 표시값 — 화면과 같은 VAT 포함 도메인 (재수렴 4차·5차 #937 근본수정).
     *
     * <p>4차: 종전에는 저장 컬럼 {@code unitPriceWithVat} 을 그대로 읽었다. 그런데 두 단가 컬럼이
     * 같은 값이 된 행(2026-07-27 실측 활성 55건)은 그 컬럼이 실제로 VAT 제외 값일 수 있어,
     * 무수정 재저장으로 컬럼이 정상화되는 것만으로 <b>사용자가 하지 않은 "단가 100,000 →
     * 110,000" 변경</b>이 레드라인에 찍혔다.
     *
     * <p>5차: 그 4차 판정("VAT 포함 항등식 불만족이면 무조건 유도")은 반대 방향의 가짜 이력을
     * 만들었다 — <b>부가세만</b> 편집하면(2026-07-25 개발책임자 결정 P6) 단가는 그대로인데
     * 항등식이 정당하게 깨져, 레드라인에 <b>"단가 110,000 → 112,500"</b> 이 찍혔다(사용자는
     * 단가를 건드리지 않았다). {@code unit_price_with_vat} 는 사용자 권위 입력이고 P4 대로
     * 역산 대상이 아니므로, <b>저장값이 VAT 제외 총액(공급가액)과 맞아떨어질 때만</b>(= 구 BE 가
     * 화면 단가를 두 컬럼에 그대로 각인한 오염 신호) 권위 합계에서 유도한다.
     *
     * <p>FE {@code lineVat.resolveAuthoredUnit} 과 같은 판정 규칙의 미러다.
     */
    private static BigDecimal unitPriceDisplayValue(SlipSnapshot.Line line) {
        BigDecimal total = lineTotalDisplayValue(line);
        BigDecimal stored = line.unitPriceWithVat() != null ? line.unitPriceWithVat() : line.unitPrice();
        if (total == null || line.quantity() <= 0) {
            return stored;
        }
        BigDecimal supply = line.supplyAmount() != null ? line.supplyAmount() : line.lineTotal();
        if (stored != null && !scaledEquals(stored.multiply(BigDecimal.valueOf(line.quantity())), supply)) {
            return stored;
        }
        if (stored != null && scaledEquals(stored.multiply(BigDecimal.valueOf(line.quantity())), total)) {
            return stored;
        }
        return total.divide(BigDecimal.valueOf(line.quantity()), 2, java.math.RoundingMode.HALF_UP);
    }

    /** 원 단위(scale 0, HALF_UP)로 반올림해 두 금액이 같은지 본다. */
    private static boolean scaledEquals(BigDecimal left, BigDecimal right) {
        if (left == null || right == null) {
            return false;
        }
        return left.setScale(0, java.math.RoundingMode.HALF_UP)
                .compareTo(right.setScale(0, java.math.RoundingMode.HALF_UP)) == 0;
    }

    private static BigDecimal lineTotalDisplayValue(SlipSnapshot.Line line) {
        BigDecimal supply = line.supplyAmount() != null ? line.supplyAmount() : line.lineTotal();
        if (supply == null) {
            return null;
        }
        if (line.vatAmount() != null) {
            return supply.add(line.vatAmount());
        }
        if (line.supplyAmount() != null) {
            return supply.add(VatAmountCalculator.fromSupply(supply));
        }
        return line.lineTotal();
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
