package com.samhanair.logis.product.service;

import com.samhanair.logis.product.domain.BundleComponent.ComponentKind;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 품목명만으로 제품구분 카테고리 코드를 보수적으로 판정한다.
 *
 * <p>시트 신규 적재와 V38 기존 품목 백필은 반드시 이 규칙을 함께 사용한다. 모델코드·현재
 * 카테고리·견적 분류(L/M/S)는 입력으로 사용하지 않아, 잘못 적재된 기존 축이 재판정 결과에
 * 영향을 주지 않는다.
 */
public final class ProductNameCategoryClassifier {

    /** 품목명 자동분류 실패 시에도 category_id 필수 계약을 지키는 루트 카테고리 코드. */
    public static final String UNREGISTERED_CODE = "UNREGISTERED";

    private static final List<Rule> RULES = List.of(
            new Rule("PIPING", "일자발|받침|거치|브라켓|앵글"),
            new Rule("OUTDOOR", "실외기"),
            new Rule("INDOOR", "실내기"),
            new Rule("SERVICE", "서비스|수수료|운임|설치비|절삭|철거비|출장비|작업비|시운전비"),
            new Rule("CONTROL", "리모컨|리모콘|중앙제어|제어기|컨트롤러|와이파이.*키트|wifi.*키트|wi-fi.*키트|통신.*키트|중계기"),
            new Rule("PIPING", "자재|부자재|받침대|받침|가대|필터|판넬|패널|데코커버|윈드가이드|몰딩|키트|kit|보드|발통|드레인|호스|분기관|배관|배수펌프|냉매관|동관|분배헤더|헤더|커버|케이블|전선|테이프|엘보|소켓|밸브|캡"),
            new Rule("HVAC", "전열교환기|erv"),
            new Rule("INDOOR_WALL", "벽걸이"),
            new Rule("INDOOR_CEILING", "시스템천장형|천장형|카세트|1-?way|4-?way|360cst|실링")
    );

    private ProductNameCategoryClassifier() {
    }

    /**
     * 공백을 제거한 품목명에 보수 규칙을 위에서부터 적용한다.
     *
     * @param productName 품목명. null 또는 미일치면 미등록으로 반환한다.
     * @return 유효한 제품구분 카테고리 코드
     */
    public static String classify(String productName) {
        return classify(productName, List.of());
    }

    /**
     * 품목명 우선 판정 뒤에만 세트 구성품 역할을 보조 신호로 사용한다.
     *
     * <p>구성품 역할은 그 구성품 품목에만 전달해야 하며 세트 자신에게 역방향으로 적용하지 않는다.
     * OUTDOOR와 INDOOR가 동시에 온 경우에는 보수적으로 미등록으로 남긴다.
     *
     * @param productName 품목명
     * @param componentKinds 이 품목을 가리키는 활성 구성품 행의 역할
     * @return 유효한 제품구분 카테고리 코드
     */
    public static String classify(String productName, Collection<ComponentKind> componentKinds) {
        String normalized = productName == null ? ""
                : productName.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
        String byName = RULES.stream()
                .filter(rule -> rule.pattern().matcher(normalized).find())
                .map(Rule::categoryCode)
                .findFirst()
                .orElse(UNREGISTERED_CODE);
        if (!UNREGISTERED_CODE.equals(byName)) {
            return byName;
        }
        return classifyFromComponentKinds(componentKinds);
    }

    private static String classifyFromComponentKinds(Collection<ComponentKind> componentKinds) {
        if (componentKinds == null || componentKinds.isEmpty()) {
            return UNREGISTERED_CODE;
        }
        EnumSet<ComponentKind> kinds = EnumSet.copyOf(componentKinds);
        if (kinds.contains(ComponentKind.OUTDOOR) && !kinds.contains(ComponentKind.INDOOR)) {
            return "OUTDOOR";
        }
        if (kinds.contains(ComponentKind.INDOOR) && !kinds.contains(ComponentKind.OUTDOOR)) {
            return "INDOOR";
        }
        if (kinds.contains(ComponentKind.OUTDOOR) || kinds.contains(ComponentKind.INDOOR)) {
            return UNREGISTERED_CODE;
        }
        if (kinds.contains(ComponentKind.REMOTE)) {
            return "CONTROL";
        }
        if (kinds.stream().anyMatch(kind -> kind == ComponentKind.ACCESSORY
                || kind == ComponentKind.PANEL || kind == ComponentKind.MATERIAL || kind == ComponentKind.FOOT)) {
            return "PIPING";
        }
        return UNREGISTERED_CODE;
    }

    private record Rule(String categoryCode, Pattern pattern) {

        private Rule(String categoryCode, String pattern) {
            this(categoryCode, Pattern.compile(pattern));
        }
    }
}
