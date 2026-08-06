package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/** 저장 입구가 BUNDLE 판정을 복제하거나 우회하지 않는다는 소스 계약 게이트. */
class BundleStoragePolicyContractTest {

    private static final Pattern LINE_PRODUCTION_CALL = Pattern.compile(
            "(?:SlipLine\\s*\\.\\s*(?:create(?:From[A-Za-z]+)?|copyOf)|EstimateLine\\s*\\.\\s*create(?:From[A-Za-z]+)?|slip\\s*\\.\\s*addLine)\\s*\\(");

    @Test
    void 매출과_매입_전체수정은_공통정책을_호출한다() throws Exception {
        assertThat(code(source("SalesSlipUpdateService.java")))
                .containsAnyOf("BundleModePolicy.shouldExpand", "BundleModePolicy::shouldExpand");
        assertThat(code(source("SlipUpdateService.java")))
                .containsAnyOf("BundleModePolicy.shouldExpand", "BundleModePolicy::shouldExpand");
    }

    @Test
    void 제품요약으로_새_전표라인을_만드는_모든_생산파일은_정책을_호출한다() throws Exception {
        Path root = Path.of("src/main/java");
        List<Path> offenders = Files.walk(root)
                .filter(Files::isRegularFile)
                .filter(path -> path.toString().endsWith(".java"))
                .filter(path -> {
                    try {
                        String text = code(Files.readString(path));
                        if (!LINE_PRODUCTION_CALL.matcher(text).find()) {
                            return false;
                        }
                        String name = path.getFileName().toString();
                        if (Set.of("BundleModePolicy.java", "SlipSeeder.java", "EstimateSeeder.java",
                                "SlipDuplicateService.java").contains(name)) {
                            return false;
                        }
                        if (name.equals("SlipLine.java")) {
                            return !text.contains("bundleSetOptions = source.bundleSetOptions");
                        }
                        if (name.equals("Slip.java")) {
                            return !text.contains("snapLine.bundleSetOptions()")
                                    || !text.contains("assignBundleComponent");
                        }
                        if (text.contains("EstimateLine")) {
                            return !text.contains("setOptions") && !text.contains("bundleSetOptions")
                                    && !text.contains("assignBundleComponent");
                        }
                        return !text.contains("BundleModePolicy.shouldExpand")
                                && !text.contains("BundleModePolicy::shouldExpand");
                    } catch (Exception e) {
                        throw new AssertionError("저장 경로 계약 파일을 읽지 못했습니다: " + path, e);
                    }
                })
                .toList();
        assertThat(offenders).as("제품 요약을 사용하는 저장 입구는 BundleModePolicy를 거쳐야 합니다")
                .isEmpty();
    }

    @Test
    void 삼천자_텍스트블록도_낮은_스택에서_계약_전처리가_완료된다() throws Exception {
        String source = "@Query(\"\"\"\n" + "x".repeat(3_000) + "\n\"\"\")\nSlipLine.create(\"x\")";
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread worker = new Thread(null, () -> {
            try {
                code(source);
            } catch (Throwable error) {
                failure.set(error);
            }
        }, "bundle-contract-text-block", 256 * 1024L);
        worker.start();
        worker.join();
        assertThat(failure.get()).isNull();
    }

    private static String source(String fileName) throws Exception {
        return Files.readString(Path.of("src/main/java/com/samhanair/logis/slip/service", fileName));
    }

    /** 주석·문자열은 계약의 증거가 아니다. 실제 Java 코드만 남겨 공격 fixture를 차단한다. */
    static String code(String source) {
        StringBuilder code = new StringBuilder(source.length());
        int index = 0;
        while (index < source.length()) {
            char current = source.charAt(index);
            if (current == '/' && index + 1 < source.length() && source.charAt(index + 1) == '/') {
                index += 2;
                while (index < source.length() && source.charAt(index) != '\n') index++;
                code.append('\n');
                continue;
            }
            if (current == '/' && index + 1 < source.length() && source.charAt(index + 1) == '*') {
                index += 2;
                while (index + 1 < source.length()
                        && !(source.charAt(index) == '*' && source.charAt(index + 1) == '/')) index++;
                index = Math.min(source.length(), index + 2);
                code.append(' ');
                continue;
            }
            if (current == '"') {
                boolean textBlock = index + 2 < source.length()
                        && source.charAt(index + 1) == '"'
                        && source.charAt(index + 2) == '"';
                index += textBlock ? 3 : 1;
                while (index < source.length()) {
                    if (textBlock) {
                        if (index + 2 < source.length()
                                && source.charAt(index) == '"'
                                && source.charAt(index + 1) == '"'
                                && source.charAt(index + 2) == '"') {
                            index += 3;
                            break;
                        }
                        index++;
                    } else {
                        if (source.charAt(index) == '\\') index += Math.min(2, source.length() - index);
                        else if (source.charAt(index++) == '"') break;
                    }
                }
                code.append("\"\"");
                continue;
            }
            if (current == '\'') {
                index++;
                while (index < source.length()) {
                    if (source.charAt(index) == '\\') index += Math.min(2, source.length() - index);
                    else if (source.charAt(index++) == '\'') break;
                }
                code.append("''");
                continue;
            }
            code.append(current);
            index++;
        }
        return code.toString();
    }
}
