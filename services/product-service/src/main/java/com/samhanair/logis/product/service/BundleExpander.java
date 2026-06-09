package com.samhanair.logis.product.service;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * BUNDLE(세트) → 구성품 전개 엔진 — legacy 종합견적서 index.html explodeSetParts/explodeCommSets_/
 * splitIndoorOutdoorToK 완전 충실 이식(개발책임자 2026-06-09 "GAS대로").
 *
 * <p><b>전개 규칙</b>:
 * <ul>
 *   <li>BUNDLE 아님 또는 KEEP → 부모 1 라인(세트 단가).</li>
 *   <li>EXPAND + 싱글세트 → 옵션 선별(패널 1/리모컨 교체/자재 포함) 후 <b>세트단가를 실내:실외
 *       6:4(가정)/4:6(비가정) 재배분</b>(고정부품 선차감, 잔차 마지막행, 천원 반올림).</li>
 *   <li>EXPAND + 상업멀티 → 옵션 선별 후 구성품 <b>개별 단가</b>(재배분 없음).</li>
 * </ul>
 *
 * <p>수량: BundleComponent.FOLLOW_SET → setQty×defaultQty, FIXED → defaultQty. (PR-1 적재 시 시트
 * 구성품은 전부 FOLLOW_SET — 'Q'→1, 숫자 N→N.)
 */
@Service
public class BundleExpander {

    private final ProductRepository productRepository;
    private final BundleComponentRepository componentRepository;

    public BundleExpander(ProductRepository productRepository,
                          BundleComponentRepository componentRepository) {
        this.productRepository = productRepository;
        this.componentRepository = componentRepository;
    }

    /** 기본 옵션(패널 기본/리모컨 유지/자재 별도)으로 전개. */
    @Transactional(readOnly = true)
    public List<ExpandedLine> expand(String parentModelCode, BigDecimal setQty) {
        return expand(parentModelCode, setQty, ExpandOptions.defaults());
    }

    /**
     * BUNDLE 부모 modelCode + 세트수량 + 옵션 → 전표/견적 구성품 라인(단가 포함).
     */
    @Transactional(readOnly = true)
    public List<ExpandedLine> expand(String parentModelCode, BigDecimal setQty, ExpandOptions opts) {
        Product parent = productRepository.findByModelCodeAndIsDeletedFalse(parentModelCode)
                .orElseThrow(() -> new EntityNotFoundException("Product 없음: " + parentModelCode));
        BigDecimal setUnit = opts.setUnitOverride() != null ? round(opts.setUnitOverride())
                : round(nz(parent.getDeliveryPrice()));

        if (parent.getProductType() != ProductType.BUNDLE) {
            return List.of(ExpandedLine.of(parent.getModelCode(), parent.getName(), setQty, setUnit, null));
        }
        BundleMode mode = parent.getBundleMode() == null ? BundleMode.EXPAND : parent.getBundleMode();
        if (mode == BundleMode.KEEP) {
            return List.of(ExpandedLine.of(parent.getModelCode(), parent.getName(), setQty, setUnit, null));
        }

        // ── EXPAND ──────────────────────────────────────────────
        List<Part> parts = new ArrayList<>();
        for (BundleComponent c : componentRepository.findByBundleProductId(parent.getId())) {
            Product cp = productRepository.findByModelCodeAndIsDeletedFalse(c.getComponentProductCode()).orElse(null);
            String name = cp != null ? cp.getName() : c.getComponentProductCode();
            BigDecimal price = cp != null ? nz(cp.getDeliveryPrice()) : BigDecimal.ZERO;
            BigDecimal qty = c.getQtyMode() == BundleComponent.QtyMode.FOLLOW_SET
                    ? setQty.multiply(c.getDefaultQty())
                    : c.getDefaultQty();
            parts.add(new Part(c.getComponentProductCode(), name, c.getComponentKind(),
                    c.getComponentVariant(), Boolean.TRUE.equals(c.getIsDefault()), price, qty));
        }

        List<Part> picked = pickedFilter(parts, opts);

        // 싱글세트만 세트단가 재배분. 상업멀티 등은 구성품 개별 단가 유지.
        if (parent.getProductCategory() == ProductCategory.SINGLE_SET) {
            redistribute(picked, parent, setUnit);
        }

        List<ExpandedLine> result = new ArrayList<>(picked.size());
        for (Part p : picked) {
            BigDecimal unit = round(p.price).max(BigDecimal.ZERO);
            result.add(ExpandedLine.of(p.modelCode, p.name, p.qty, unit, p.kind));
        }
        return result;
    }

    // ── 옵션 선별(picked) — legacy explodeSetParts 4684~4720 ─────────────────────
    private List<Part> pickedFilter(List<Part> parts, ExpandOptions opts) {
        // 패널 1개 선택
        Part basePanel = parts.stream().filter(this::isPanel).filter(p -> p.isDefault).findFirst().orElse(null);
        Part pickPanel = pickPanel(parts, opts, basePanel);
        // 리모컨 교체 결과 집합
        List<String> remoteModels = resolveRemotes(parts, opts);

        List<Part> picked = new ArrayList<>();
        for (Part p : parts) {
            if (isFoot(p) || isHideMat(p)) {
                continue;
            }
            if (isPanel(p)) {
                if (basePanel == null) { picked.add(p); continue; }   // 기본패널 미정의 → 전부 통과
                if (pickPanel == null) { continue; }                  // 판넬제외 → 모든 패널 제거
                if (p.modelCode.equals(pickPanel.modelCode)) { picked.add(p); }
                continue;                                             // 선택된 패널만
            }
            if (isRemote(p)) {
                if (remoteModels.contains(p.modelCode)) { picked.add(p); }
                continue;
            }
            if (isMaterial(p)) {
                if (opts.materialIncluded()) { picked.add(p); }
                continue;
            }
            picked.add(p);
        }
        return picked;
    }

    /** 패널 1개 선택 — 판넬제외/옵션 키워드/360 형상/기본 순. legacy pickPanelRow. */
    private Part pickPanel(List<Part> parts, ExpandOptions opts, Part basePanel) {
        String opt = opts.panelOption() == null ? "" : opts.panelOption();
        if ("판넬제외".equals(opt)) {
            return null;
        }
        List<Part> panels = parts.stream().filter(this::isPanel).toList();
        if (panels.isEmpty()) {
            return null;
        }
        java.util.function.Predicate<Part> kw = switch (opt) {
            case "블랙판넬" -> p -> textOf(p).matches(".*블랙.*");
            case "승강판넬" -> p -> textOf(p).matches(".*(자동승강|승강).*");
            case "공청판넬" -> p -> textOf(p).matches(".*(공기청정|공청).*");
            default -> null;
        };
        if (kw != null) {
            Part m = panels.stream().filter(kw).findFirst().orElse(null);
            if (m != null) {
                return m;
            }
        }
        // 360 형상 매칭(원형/사각)
        boolean is360 = parts.stream().anyMatch(p -> textOf(p).matches(".*(360-?CST|CST-?360|360CST).*"));
        if (is360 && opts.panelShape360() != null && !opts.panelShape360().isBlank()) {
            Part shape = panels.stream()
                    .filter(p -> textOf(p).contains(opts.panelShape360())).findFirst().orElse(null);
            if (shape != null) {
                return shape;
            }
        }
        return basePanel != null ? basePanel : panels.get(0);
    }

    /** 리모컨 교체 — 제외/유선 옵션 치환/기본 유지. legacy 4691~4705. */
    private List<String> resolveRemotes(List<Part> parts, ExpandOptions opts) {
        List<Part> remotes = parts.stream().filter(this::isRemote).toList();
        if (opts.remoteExcluded()) {
            return List.of();
        }
        List<Part> defaults = remotes.stream().filter(p -> p.isDefault).toList();
        if (defaults.isEmpty()) {
            defaults = remotes;
        }
        String opt = opts.remoteOption() == null ? "" : opts.remoteOption();
        if (!opt.isBlank() && allowRemoteChange(defaults)) {
            Part option = remotes.stream().filter(p -> matchOptionRemote(p, opt)).findFirst().orElse(null);
            if (option != null) {
                // 기본 중 유선 1개(없으면 첫 row) 제거 후 옵션 추가
                Part drop = defaults.stream().filter(p -> textOf(p).matches(".*유선.*")).findFirst()
                        .orElse(defaults.get(0));
                List<String> models = new ArrayList<>();
                for (Part d : defaults) {
                    if (!d.modelCode.equals(drop.modelCode)) {
                        models.add(d.modelCode);
                    }
                }
                models.add(option.modelCode);
                return models;
            }
        }
        return defaults.stream().map(p -> p.modelCode).toList();
    }

    private boolean matchOptionRemote(Part p, String opt) {
        String t = textOf(p);
        return switch (opt) {
            case "유선리모컨" -> t.matches(".*유선리모컨.*") && !t.matches(".*컬러.*");
            case "컬러유선리모컨" -> t.matches(".*(컬러유선리모컨|유선컬러).*");
            default -> false;
        };
    }

    private boolean allowRemoteChange(List<Part> defaults) {
        return defaults.stream().anyMatch(p ->
                p.modelCode != null && p.modelCode.toUpperCase().matches("AR-?EH05|AR-?EC05|AR-?KH05"));
    }

    // ── 싱글세트 재배분 — legacy explodeSetParts 후반부 + splitIndoorOutdoorToK ──────
    private void redistribute(List<Part> picked, Product parent, BigDecimal setUnit) {
        boolean household = isHousehold(parent.getName(), parent.getModelCode(), parent.getSpecText());

        List<Part> indoor = new ArrayList<>();
        List<Part> outdoor = new ArrayList<>();
        List<Part> fixed = new ArrayList<>();
        for (Part p : picked) {
            if (isOutdoorUnitPart(p)) {
                outdoor.add(p);
            } else if (isIndoorUnitPart(p)) {
                // 가정용 벽걸이 실내기 본체는 fixed 로 이동(원단가 유지).
                if (household && textOf(p).matches(".*벽걸이.*")) {
                    fixed.add(p);
                } else {
                    indoor.add(p);
                }
            } else {
                fixed.add(p);
            }
        }
        if (indoor.isEmpty() || outdoor.isEmpty()) {
            return; // 한쪽 본체 없으면 재배분 안 함(부품 원단가 유지)
        }

        int ratioIn = household ? 6 : 4;
        int ratioOut = household ? 4 : 6;
        BigDecimal fixedSum = BigDecimal.ZERO;
        for (Part f : fixed) {
            fixedSum = fixedSum.add(round(f.price));
        }
        Split split = splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut);

        assignGroup(indoor, split.indoor);
        assignGroup(outdoor, split.outdoor);
    }

    /** 그룹 가격 배분 — 1개면 통째, 다수면 기존단가 비례 + 마지막 잔차 흡수(천원 반올림). */
    private void assignGroup(List<Part> group, BigDecimal total) {
        if (group.size() == 1) {
            group.get(0).price = total;
            return;
        }
        BigDecimal base = BigDecimal.ZERO;
        for (Part p : group) {
            base = base.add(p.price);
        }
        if (base.signum() == 0) {
            base = BigDecimal.valueOf(group.size()); // 0이면 균등
        }
        BigDecimal acc = BigDecimal.ZERO;
        for (int i = 0; i < group.size(); i++) {
            Part p = group.get(i);
            if (i < group.size() - 1) {
                BigDecimal w = p.price.signum() == 0 ? BigDecimal.ONE : p.price;
                BigDecimal v = roundK(total.multiply(w).divide(base, 0, RoundingMode.HALF_UP));
                p.price = v;
                acc = acc.add(v);
            } else {
                p.price = total.subtract(acc); // 마지막 = 잔차
            }
        }
    }

    /** legacy splitIndoorOutdoorToK (2972~2998). */
    private Split splitIndoorOutdoorToK(BigDecimal setUnit, BigDecimal fixedSum, int ratioIn, int ratioOut) {
        BigDecimal remain = round(setUnit).subtract(round(fixedSum)).max(BigDecimal.ZERO);
        int tot = ratioIn + ratioOut;
        BigDecimal indoor = roundK(remain.multiply(BigDecimal.valueOf(ratioIn))
                .divide(BigDecimal.valueOf(tot), 0, RoundingMode.HALF_UP));
        BigDecimal outdoor = remain.subtract(indoor);
        // 실외기 천원 정렬(나머지를 실내↔실외 이동)
        long mod = ((outdoor.longValue() % 1000) + 1000) % 1000;
        if (mod != 0) {
            BigDecimal m = BigDecimal.valueOf(mod);
            if (outdoor.signum() > 0) {
                indoor = indoor.subtract(m);
                outdoor = outdoor.add(m);
            } else {
                BigDecimal inv = BigDecimal.valueOf(1000 - mod);
                indoor = indoor.add(inv);
                outdoor = outdoor.subtract(inv);
            }
        }
        if (indoor.signum() < 0) {
            outdoor = outdoor.add(indoor);
            indoor = BigDecimal.ZERO;
        }
        if (outdoor.signum() < 0) {
            indoor = indoor.add(outdoor);
            outdoor = BigDecimal.ZERO;
        }
        return new Split(indoor, outdoor);
    }

    // ── 분류 helper — legacy isPanel/isRemote/isFoot/isMaterial/isHideMat/isIndoor/isOutdoorUnitPart ──
    private boolean isRemote(Part p) {
        return p.kind == BundleComponent.ComponentKind.REMOTE || textOf(p).matches(".*리모[컨콘].*");
    }

    private boolean isPanel(Part p) {
        return p.kind == BundleComponent.ComponentKind.PANEL || textOf(p).matches(".*(판넬|판널|패널).*");
    }

    private boolean isFoot(Part p) {
        return p.kind == BundleComponent.ComponentKind.FOOT
                || textOf(p).contains("발통")
                || (p.modelCode != null && p.modelCode.toUpperCase().contains("SI-AL700A"));
    }

    private boolean isMaterial(Part p) {
        return p.kind == BundleComponent.ComponentKind.MATERIAL
                || (p.variant != null && p.variant.contains("자재"));
    }

    private boolean isHideMat(Part p) {
        return textOf(p).matches(".*(유연호스\\s*I형|운임|절삭).*");
    }

    private boolean isIndoorUnitPart(Part p) {
        if (p.kind == BundleComponent.ComponentKind.INDOOR) {
            return !(isPanel(p) || isRemote(p) || isMaterial(p) || isFoot(p));
        }
        return false;
    }

    private boolean isOutdoorUnitPart(Part p) {
        if (p.kind == BundleComponent.ComponentKind.OUTDOOR) {
            return !(isPanel(p) || isRemote(p) || isMaterial(p) || isFoot(p));
        }
        return false;
    }

    /**
     * 가정용 판정 — legacy classifySingleSetFixed else-if 순서 + name 직접 매칭(explodeSetParts:4741).
     * name 이 "가정용 에어컨"이면 우선 true. 그 외 발통/360/4way/1way/덕트/실링/스탠드/벽걸이가 먼저
     * 매칭되면 비가정(catL 다름), 그 후 /가정용/ 매칭 시 가정용.
     */
    boolean isHousehold(String name, String model, String spec) {
        String nm = name == null ? "" : name;
        if (nm.replaceAll("\\s+", "").matches(".*가정용에어컨.*")) {
            return true;
        }
        String hay = (nm + " " + (model == null ? "" : model) + " " + (spec == null ? "" : spec)).toLowerCase();
        String mdl = model == null ? "" : model.trim();
        if ("ADP-F075SP".equalsIgnoreCase(mdl)) return false;
        if (hay.matches(".*(발통|일자발|받침).*")) return false;
        if (hay.matches(".*(360|cst).*")) return false;
        if (hay.matches(".*(4\\s*way).*")) return false;
        if (hay.matches(".*(1\\s*way).*")) return false;
        if (hay.matches(".*(덕트|duct).*")) return false;
        if (hay.matches(".*실링.*")) return false;
        if (hay.matches(".*스탠드.*")) return false;
        if (hay.matches(".*벽걸이.*")) return false;
        return hay.matches(".*가정용.*");
    }

    private static String textOf(Part p) {
        return ((p.name == null ? "" : p.name) + " " + (p.variant == null ? "" : p.variant)
                + " " + (p.modelCode == null ? "" : p.modelCode));
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static BigDecimal round(BigDecimal v) {
        return nz(v).setScale(0, RoundingMode.HALF_UP);
    }

    /** 천원 단위 반올림(legacy roundK). */
    private static BigDecimal roundK(BigDecimal v) {
        return nz(v).divide(BigDecimal.valueOf(1000), 0, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(1000));
    }

    /** 전개 라인 — 단가 포함. componentKind 는 KEEP/단일 라인 시 null. */
    public record ExpandedLine(String modelCode, String name, BigDecimal quantity,
                               BigDecimal unitPrice, BundleComponent.ComponentKind componentKind) {
        public static ExpandedLine of(String modelCode, String name, BigDecimal quantity,
                                      BigDecimal unitPrice, BundleComponent.ComponentKind kind) {
            return new ExpandedLine(modelCode, name, quantity, unitPrice, kind);
        }
    }

    /**
     * 전개 옵션 — legacy ss_remote/ss_remote_ex/ss_panel/ss_p360/ss_mat 대응.
     *
     * @param remoteOption    '' | '유선리모컨' | '컬러유선리모컨'
     * @param remoteExcluded  리모컨 제외
     * @param panelOption     '' | '판넬제외' | '블랙판넬' | '승강판넬' | '공청판넬'
     * @param panelShape360   '원형' | '사각'
     * @param materialIncluded 자재 포함 여부('포함')
     * @param setUnitOverride 세트 단가 오버라이드(null 이면 Product.deliveryPrice)
     */
    public record ExpandOptions(String remoteOption, boolean remoteExcluded, String panelOption,
                                String panelShape360, boolean materialIncluded, BigDecimal setUnitOverride) {
        public static ExpandOptions defaults() {
            return new ExpandOptions("", false, "", "원형", false, null);
        }
    }

    private record Split(BigDecimal indoor, BigDecimal outdoor) {}

    /** 전개 중간 가변 holder. */
    private static final class Part {
        final String modelCode;
        final String name;
        final BundleComponent.ComponentKind kind;
        final String variant;
        final boolean isDefault;
        BigDecimal price;
        final BigDecimal qty;

        Part(String modelCode, String name, BundleComponent.ComponentKind kind, String variant,
             boolean isDefault, BigDecimal price, BigDecimal qty) {
            this.modelCode = modelCode;
            this.name = name;
            this.kind = kind;
            this.variant = variant;
            this.isDefault = isDefault;
            this.price = price == null ? BigDecimal.ZERO : price;
            this.qty = qty;
        }
    }
}
