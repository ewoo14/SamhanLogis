package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class DailyClosingSnapshotBaselineTest {

    private static final Path SNAPSHOT = locateSnapshot();
    private static final String OUTDOOR = "실외기";
    private static final String INDOOR = "실내기";

    @Test
    void keepsTheAuthoritativeSingleComponentSnapshotImmutable() throws Exception {
        byte[] bytes = Files.readAllBytes(SNAPSHOT);
        List<List<String>> rows = parseCsv(new String(bytes, StandardCharsets.UTF_8));

        assertThat(sha256(bytes))
                .isEqualTo("405b2596d61a2a4f3658bc9ed4f75d0b3ba9dfcf7a643e9ce38bbbc88ed0e663");
        assertThat(rows).hasSize(1736);
        assertThat(rows.get(0)).hasSize(14);
        assertThat(rows.subList(1, rows.size()))
                .allSatisfy(row -> assertThat(row).hasSize(14));
        assertThat(rows.subList(1, rows.size()).stream().filter(row -> INDOOR.equals(row.get(3))))
                .hasSize(271);
        assertThat(rows.subList(1, rows.size()).stream().filter(row -> OUTDOOR.equals(row.get(3))))
                .hasSize(271);
        assertThat(rows.subList(1, rows.size()).stream()
                .filter(row -> OUTDOOR.equals(row.get(3)))
                .filter(row -> row.get(2).isBlank() || row.get(12).isBlank()))
                .isEmpty();
    }

    /** CSV parser that preserves quoted commas and embedded newlines in the raw snapshot. */
    private static List<List<String>> parseCsv(String csv) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < csv.length(); i++) {
            char ch = csv.charAt(i);
            if (ch == '"') {
                if (quoted && i + 1 < csv.length() && csv.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == ',' && !quoted) {
                row.add(cell.toString());
                cell.setLength(0);
            } else if ((ch == '\n' || ch == '\r') && !quoted) {
                if (ch == '\r' && i + 1 < csv.length() && csv.charAt(i + 1) == '\n') {
                    i++;
                }
                row.add(cell.toString());
                cell.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else {
                cell.append(ch);
            }
        }
        if (cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }

    private static String sha256(byte[] bytes) throws NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder result = new StringBuilder();
        for (byte value : digest) {
            result.append(String.format("%02x", value));
        }
        return result.toString();
    }

    private static Path locateSnapshot() {
        Path workingDirectory = Path.of(System.getProperty("user.dir"));
        Path direct = workingDirectory.resolve(
                "docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv");
        if (Files.exists(direct)) {
            return direct;
        }
        return workingDirectory.resolve(
                "../../docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv")
                .normalize();
    }
}
