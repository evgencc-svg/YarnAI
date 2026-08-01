"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const extraction = require("../src/yarnai/static/pattern-content-extraction.js");
const rules = require("../src/yarnai/static/pattern-semantic-rules.js");
const semantic = require("../src/yarnai/static/pattern-semantic-analysis.js");

const repositories = [];
const stamp = (seconds) => new Date(seconds * 1000).toISOString();

function sourceFile(text, overrides = {}) {
  return { sourceFileId: overrides.sourceFileId || "file-1", order: overrides.order || 1, name: overrides.name || "pattern.txt", mediaType: overrides.mediaType || "text/plain", size: text.length, extractionStatus: overrides.extractionStatus || "extracted", text, textLength: text.length, warnings: overrides.warnings || [], error: overrides.error || null };
}

function extractionValue(text, overrides = {}) {
  const files = overrides.files || [sourceFile(text)];
  return { status: overrides.status || "completed", sourceImportRevision: overrides.sourceImportRevision || 4, revision: overrides.revision || 3, projectId: overrides.projectId || "project", result: extraction.buildResult(files) };
}

async function fixture(text, options = {}) {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Semantic" });
  const added = await repository.addCalculation(project.project_id, { axes: ["width"] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const files = options.files || [sourceFile(text)];
  const importProgress = await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, "PATTERN_IMPORT", { projectId: project.project_id, revision: 4, status: "completed", materials: files.map((file) => ({ id: file.sourceFileId, order: file.order, displayName: file.name, type: "text", size: file.size })) });
  const analysisProgress = await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, "PATTERN_ANALYSIS", { projectId: project.project_id, revision: 2, status: "completed", sourceImportRevision: 4 });
  let source = extraction.createInitialState({ projectId: project.project_id, sourceImportId: importProgress.progress_id, sourceImportRevision: 4, sourceAnalysisId: analysisProgress.progress_id, sourceAnalysisRevision: 2, filesCount: files.length }, stamp(1));
  await repository.ensurePatternContentExtraction(project.project_id, added.calculation.calculation_id, source);
  source = extraction.startState(source, stamp(2)); await repository.startPatternContentExtraction(project.project_id, added.calculation.calculation_id, source);
  source = extraction.finishState(source, extraction.buildResult(files), stamp(3));
  if (source.status === "failed") throw new Error("fixture extraction must be completed or partial");
  await repository.completePatternContentExtraction(project.project_id, added.calculation.calculation_id, source);
  return { repository, project, calculation: added.calculation, extraction: source };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("empty result is complete, stable and deeply immutable", () => {
  const result = semantic.emptyResult(); assert.equal(result.schemaVersion, 1); assert.deepEqual(result, rules.emptyResult()); assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.sourceSummary), true); assert.equal(Object.isFrozen(result.evidence), true); assert.throws(() => result.sections.push({}));
});

test("normalization handles CRLF, NBSP, quotes and dashes while preserving offsets", () => {
  const normalized = rules.normalizeTextWithOffsets("A\r\nB\u00a0  “C”—D\rE");
  assert.equal(normalized.text, 'A\nB "C"-D\nE'); assert.equal(normalized.offsets[1], 1); assert.equal(normalized.offsets.at(-1), 14);
});

for (const [language, text] of [
  ["en", "The knitting pattern and gauge: knit the row with stitches."],
  ["ru", "Размер и плотность: вязать лицевые петли, набрать петли."],
  ["uk", "Розмір і щільність: в’язати лицьові петлі, набрати."],
  ["pl", "Rozmiar i próbka: robić na drutach, oczko prawe, nabrać."],
  ["de", "Größe und Maschenprobe: stricken, rechte Masche, anschlagen."],
]) test(`detects ${language} locally`, () => assert.equal(rules.detectLanguage(text).primary, language));

test("reports multiple detected languages deterministically", () => {
  const value = rules.detectLanguage("The knitting pattern and row. Größe und Maschenprobe, rechte Masche und Reihe."); assert.equal(value.primary, "de"); assert.ok(value.detected.some((item) => item.language === "en")); assert.deepEqual(value, rules.detectLanguage("The knitting pattern and row. Größe und Maschenprobe, rechte Masche und Reihe."));
});

test("detects knitting, crochet, garment and construction without inventing a plan", () => {
  const knitting = rules.analyzeExtraction(extractionValue("Sweater knitting pattern. Top down raglan, knit in the round. Row 1: knit.")); assert.equal(knitting.craft.value, "knitting"); assert.equal(knitting.garment.type, "sweater"); assert.equal(knitting.construction.method, "top_down"); assert.equal(knitting.construction.workedInRound, "yes");
  const crochet = rules.analyzeExtraction(extractionValue("Crochet hat. Hook 4 mm. Round 1: single crochet and chain stitch.")); assert.equal(crochet.craft.value, "crochet"); assert.equal(rules.determineStatus(extractionValue("Crochet hat. Hook 4 mm. Round 1: single crochet and chain stitch."), crochet), "partial"); assert.ok(crochet.diagnostics.some((item) => item.code === "SEMANTIC_CROCHET_UNSUPPORTED"));
});

test("extracts sizing, gauge, yarn, tools, abbreviations, sections, rows, repeats and counts", () => {
  const text = ["Sweater", "Sizes: XS S M L XL", "Materials", "Yarn: Acme Merino, color no. 12 Blue, 500 g, 100% wool", "Needles 4.5 mm, circular needles 80 cm, stitch markers", "Gauge", "20 stitches and 28 rows = 10 cm", "Abbreviations", "k — knit", "Instructions", "Cast on 80 stitches.", "Row 1: knit all stitches", "Round 2: purl", "Repeat from * to * 3 times", "Bind off 80 stitches."].join("\n");
  const result = rules.analyzeExtraction(extractionValue(text));
  assert.ok(result.sizing.labels.includes("XS")); assert.equal(result.gauge.stitches[0].value, "20"); assert.equal(result.gauge.rows[0].value, "28"); assert.ok(result.yarn.amounts.length); assert.ok(result.yarn.fiberContent.length); assert.equal(result.tools.needleSizes[0].value, "4.5"); assert.equal(result.tools.stitchMarkersMentioned, true); assert.ok(result.abbreviations.some((item) => item.abbreviation === "k")); assert.ok(result.sections.some((item) => item.type === "materials")); assert.equal(result.rowInstructions.length, 2); assert.equal(result.repeatInstructions.length, 1); assert.equal(result.counts.castOn[0].value, 80); assert.equal(result.counts.bindOff[0].value, 80);
});

for (const [label, text, stitches, rows, per, unit] of [
  ["English pair", "20 stitches and 28 rows = 10 cm", "20", "28", "10", "cm"],
  ["English single", "20 sts / 10 cm", "20", null, "10", "cm"],
  ["Russian pair", "20 петель × 28 рядов = 10 × 10 см", "20", "28", "10", "cm"],
  ["Polish single", "22 oczka na 10 cm", "22", null, "10", "cm"],
  ["German pair", "18 M x 24 R = 10 x 10 cm", "18", "24", "10", "cm"],
  ["Four inches", "20 stitches and 28 rows = 4 inches", "20", "28", "4", "in"],
]) test(`extracts gauge notation: ${label}`, () => {
  const gauge = rules.analyzeExtraction(extractionValue(`Gauge\n${text}`)).gauge; assert.equal(gauge.stitches[0]?.value, stitches); assert.equal(gauge.rows[0]?.value || null, rows); assert.equal(gauge.stitches[0]?.per, per); assert.equal(gauge.stitches[0]?.unit, unit);
});

test("keeps numeric sizes, ranges, measurements and stitch pattern mentions", () => {
  const result = rules.analyzeExtraction(extractionValue("Sweater knitting pattern\nSizes: 36 38 40\nChest: 90-100 cm\nStockinette stitch\nRow 1: knit")); assert.ok(result.sizing.labels.includes("36")); assert.equal(result.sizing.measurements[0].value, "90-100"); assert.equal(result.sizing.measurements[0].unit, "cm"); assert.equal(result.stitchPatterns[0].name, "stockinette");
});

test("machine knitting and chart without legend are partial unsupported content", () => {
  const source = extractionValue("Machine knitting sweater. Chart: see https://example.invalid/chart. Row 1: knit."); const result = rules.analyzeExtraction(source); assert.equal(result.craft.value, "machine_knitting"); assert.equal(rules.determineStatus(source, result), "partial"); assert.ok(result.diagnostics.some((item) => item.code === "SEMANTIC_MACHINE_KNITTING_UNSUPPORTED")); assert.ok(result.diagnostics.some((item) => item.code === "SEMANTIC_CHART_WITHOUT_LEGEND")); assert.ok(result.unsupportedContent.some((item) => item.code === "external_chart_reference"));
});

test("Stage 18 production modules do not use regular expressions", () => {
  for (const name of ["pattern-semantic-rules.js", "pattern-semantic-analysis.js", "pattern-semantic-worker.js", "pattern-semantic-analysis-assistant.js"]) { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8"); assert.doesNotMatch(source, /RegExp|matchAll|\.match\(|\.test\(|replace\(\s*\//); }
});

test("one million characters complete within a bounded local runtime", () => {
  const prefix = "Sweater knitting pattern. Sizes S M L. Gauge 20 stitches and 28 rows = 10 cm. Needles 4 mm. Row 1: knit.\n"; const text = `${prefix}${"plain source line without instruction\n".repeat(26000)}`; const started = performance.now(); const result = rules.analyzeExtraction(extractionValue(text)); assert.ok(performance.now() - started < 5000); assert.equal(result.sourceSummary.textLength > 900_000, true); assert.equal(result.craft.value, "knitting");
});

test("evidence points to original combinedText and is capped", () => {
  const text = `prefix\r\nSweater ${"x".repeat(700)}`; const value = extractionValue(text); const result = rules.analyzeExtraction(value); const item = result.garment.evidence[0]; assert.equal(value.result.combinedText.slice(item.start, item.end), "Sweater"); assert.ok(item.text.length <= 500); assert.equal(item.sourceFileId, "file-1");
});

test("result is byte-for-byte deterministic including Unicode and long text", () => {
  const text = `Свитер. Размер S. Плотность 20 петель × 28 рядов = 10 см. Ряд 1: лицевая.\n${"обычный текст ".repeat(20000)}`; const source = extractionValue(text); assert.equal(JSON.stringify(rules.analyzeExtraction(source)), JSON.stringify(rules.analyzeExtraction(source))); assert.equal(rules.fingerprintExtraction(source), rules.fingerprintExtraction(structuredClone(source)));
});

test("partial and truncated sources are diagnosed", () => {
  const text = "Sweater knitting pattern. Row 1: knit."; const good = sourceFile(text); const file = sourceFile("omitted", { sourceFileId: "file-2", order: 2, extractionStatus: "truncated", warnings: [{ code: "file_text_too_long", message: "cut" }], error: { code: "file_text_too_long", message: "cut" } }); const source = extractionValue(text, { status: "partial", files: [good, file] }); const result = rules.analyzeExtraction(source); assert.ok(result.diagnostics.some((item) => item.code === "SEMANTIC_SOURCE_PARTIAL")); assert.ok(result.diagnostics.some((item) => item.code === "SEMANTIC_SOURCE_TRUNCATED")); assert.equal(rules.determineStatus(source, result), "partial");
});

test("empty and image-only source fail with controlled diagnostics", () => {
  const image = sourceFile("", { sourceFileId: "image", name: "chart.png", mediaType: "image/png", extractionStatus: "metadata_only", warnings: [{ code: "unsupported_file_type", message: "no OCR" }] }); const source = extractionValue("", { status: "partial", files: [image] }); source.result.combinedText = ""; const result = rules.analyzeExtraction(source); assert.equal(rules.determineStatus(source, result), "failed"); assert.ok(result.diagnostics.some((item) => item.code === "SEMANTIC_IMAGE_ONLY_SOURCE")); assert.ok(result.diagnostics.some((item) => item.code === "SEMANTIC_NO_TEXT"));
});

test("creates one waiting record only after completed or partial extraction", async () => {
  const context = await fixture("Sweater knitting pattern. Size S. Gauge 20 stitches = 10 cm. Row 1: knit."); const first = await semantic.ensureForProject(context.repository, context.project.project_id); const second = await semantic.ensureForProject(context.repository, context.project.project_id); assert.equal(first.analysis.status, "waiting"); assert.deepEqual(second.analysis, first.analysis); assert.equal((await context.repository.getProject(context.project.project_id)).progress.filter((item) => item.kind === semantic.PROGRESS_KIND).length, 1);
  const waitingSource = extraction.startState(context.extraction, stamp(4)); assert.throws(() => semantic.createInitialState({ projectId: "p" }), { code: "SEMANTIC_SOURCE_REVISION_MISMATCH" }); assert.equal(waitingSource.status, "extracting");
});

test("rejects creation for waiting extraction", async () => {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize(); const project = await repository.createProject({ title: "Waiting" }); const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] }); const source = extraction.createInitialState({ projectId: project.project_id, sourceImportId: "i", sourceImportRevision: 1, sourceAnalysisId: "a", sourceAnalysisRevision: 1, filesCount: 1 }); await repository.ensurePatternContentExtraction(project.project_id, added.calculation.calculation_id, source); await assert.rejects(semantic.ensureForProject(repository, project.project_id), { code: "SEMANTIC_SOURCE_REVISION_MISMATCH" });
});

test("runs completed analysis and repository API gets it by projectId", async () => {
  const context = await fixture("Sweater knitting pattern. Sizes S M. Gauge 20 stitches and 28 rows = 10 cm. Row 1: knit all stitches."); const result = await semantic.runForProject(context.repository, context.project.project_id); assert.equal(result.analysis.status, "completed"); assert.equal((await context.repository.getPatternSemanticAnalysis(context.project.project_id)).state.id, result.analysis.id);
});

test("crochet produces partial and retry rebuilds result with a higher revision", async () => {
  const context = await fixture("Crochet hat pattern. Size M. Gauge 20 stitches = 10 cm. Round 1: single crochet."); let result = await semantic.runForProject(context.repository, context.project.project_id); assert.equal(result.analysis.status, "partial"); const revision = result.analysis.revision; result = await semantic.retryForProject(context.repository, context.project.project_id); assert.equal(result.analysis.status, "partial"); assert.ok(result.analysis.revision > revision); assert.equal(result.analysis.result.diagnostics.filter((item) => item.code === "SEMANTIC_CROCHET_UNSUPPORTED").length, 1);
});

test("source revision and fingerprint mismatches invalidate an existing analysis", async () => {
  const context = await fixture("Sweater knitting pattern. Sizes S. Gauge 20 stitches = 10 cm. Row 1: knit."); await semantic.runForProject(context.repository, context.project.project_id); const aggregate = await context.repository.getProject(context.project.project_id); const sourceProgress = aggregate.progress.find((item) => item.kind === extraction.PROGRESS_KIND); const db = await context.repository._database(); let transaction = db.transaction("progress", "readwrite"); sourceProgress.state.revision += 1; transaction.objectStore("progress").put(sourceProgress); await new Promise((resolve) => { transaction.oncomplete = resolve; }); let inspected = semantic.inspectAggregate(await context.repository.getProject(context.project.project_id)); assert.equal(inspected.diagnostic.code, "SEMANTIC_SOURCE_REVISION_MISMATCH");
  transaction = db.transaction("progress", "readwrite"); sourceProgress.state.revision -= 1; sourceProgress.state.result.combinedText += " changed"; transaction.objectStore("progress").put(sourceProgress); await new Promise((resolve) => { transaction.oncomplete = resolve; }); inspected = semantic.inspectAggregate(await context.repository.getProject(context.project.project_id)); assert.equal(inspected.diagnostic.code, "SEMANTIC_SOURCE_FINGERPRINT_MISMATCH");
});

test("explicit retry rebases a failed analysis to a new extraction revision", async () => {
  const context = await fixture("Sweater knitting pattern. Sizes S. Gauge 20 stitches = 10 cm. Row 1: knit."); let inspected = await semantic.runForProject(context.repository, context.project.project_id); const oldSourceRevision = inspected.analysis.sourceExtractionRevision; const aggregate = await context.repository.getProject(context.project.project_id); const sourceProgress = aggregate.progress.find((item) => item.kind === extraction.PROGRESS_KIND); sourceProgress.state.revision += 1; const db = await context.repository._database(); const transaction = db.transaction("progress", "readwrite"); transaction.objectStore("progress").put(sourceProgress); await new Promise((resolve) => { transaction.oncomplete = resolve; }); inspected = await semantic.retryForProject(context.repository, context.project.project_id); assert.equal(inspected.analysis.status, "completed"); assert.equal(inspected.analysis.sourceExtractionRevision, oldSourceRevision + 1); assert.equal(inspected.analysis.sourceFingerprint, rules.fingerprintExtraction(sourceProgress.state));
});

test("interrupted reload becomes failed and can retry", async () => {
  const context = await fixture("Sweater knitting pattern. Sizes S. Gauge 20 stitches = 10 cm. Row 1: knit."); let inspected = await semantic.ensureForProject(context.repository, context.project.project_id); const started = semantic.startState(inspected.analysis); await context.repository.startPatternSemanticAnalysis(context.project.project_id, context.calculation.calculation_id, started); await context.repository.close(); repositories.splice(repositories.indexOf(context.repository), 1); const reopened = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(reopened); await reopened.initialize(); inspected = await semantic.ensureForProject(reopened, context.project.project_id); assert.equal(inspected.analysis.status, "failed"); assert.ok(inspected.analysis.result.diagnostics.some((item) => item.code === "SEMANTIC_ANALYSIS_INTERRUPTED")); inspected = await semantic.retryForProject(reopened, context.project.project_id); assert.equal(inspected.analysis.status, "completed");
});

test("controlled internal exception does not leave analyzing", async () => {
  const context = await fixture("Sweater knitting pattern. Sizes S. Gauge 20 stitches = 10 cm. Row 1: knit."); await assert.rejects(semantic.runForProject(context.repository, context.project.project_id, { beforeAnalyze() { throw new Error("boom"); } }), { code: "SEMANTIC_INTERNAL_ERROR" }); const inspected = semantic.inspectAggregate(await context.repository.getProject(context.project.project_id)); assert.equal(inspected.analysis.status, "failed"); assert.ok(inspected.analysis.result.diagnostics.some((item) => item.code === "SEMANTIC_INTERNAL_ERROR"));
});

test("export/import includes result, remaps source id and prevents false completion", async () => {
  const context = await fixture("Sweater knitting pattern. Sizes S. Gauge 20 stitches = 10 cm. Row 1: knit."); const completed = await semantic.runForProject(context.repository, context.project.project_id); const exported = await context.repository.exportProject(context.project.project_id); assert.match(exported.json, /PATTERN_SEMANTIC_ANALYSIS/); const imported = await context.repository.importProject(exported.json); const inspected = semantic.inspectAggregate(await context.repository.getProject(imported.project_id)); assert.equal(inspected.analysis.status, "failed"); assert.notEqual(inspected.analysis.sourceExtractionId, completed.analysis.sourceExtractionId); assert.ok(inspected.analysis.result.diagnostics.some((item) => item.code === "SEMANTIC_SOURCE_REVISION_MISMATCH")); const repeated = await context.repository.importProject(exported.json); assert.equal(repeated.status, "ALREADY_IMPORTED");
});

test("safe UI rendering never assigns extracted content through innerHTML", () => {
  const malicious = '<img src=x onerror=alert(1)>\n<script>alert(1)</script>'; const result = rules.analyzeExtraction(extractionValue(malicious)); assert.equal(result.sourceSummary.textLength > 0, true); const controller = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-semantic-analysis-assistant.js"), "utf8"); assert.match(controller, /textContent/); assert.doesNotMatch(controller, /innerHTML/); assert.doesNotMatch(controller, /insertAdjacentHTML/);
});
