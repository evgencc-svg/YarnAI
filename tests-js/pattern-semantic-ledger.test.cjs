"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

global.window = globalThis;
const rules = require("../src/yarnai/static/pattern-semantic-rules.js");
const semanticAnalysis = require("../src/yarnai/static/pattern-semantic-analysis.js");
const review = require("../src/yarnai/static/pattern-analysis-review.js");
const experience = require("../src/yarnai/static/material-understanding-experience.js");

const SIZE_LABELS = [
  "0-6 mo", "6-12 mo", "1-2 yrs", "2-4 yrs", "4-6 yrs", "6-8 yrs", "8-10 yrs",
  "XS", "S", "SM", "M", "ML", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL",
];

function fixture() {
  const pages = [
    { pageNumber: 2, text: [
      "FLAX — a seamless top down raglan sweater knitting pattern",
      "NECKLINE",
      "BODY",
      "SLEEVES",
      "SIZING:",
      "0-6 mo, 6-12 mo, 1-2 yrs, 2-4 yrs, 4-6 yrs, 6-8 yrs, 8-10 yrs, Adult XS, S, SM, M, ML, L, XL, XXL, 3XL, 4XL, 5XL, 6XL",
      "200, 240, 280, 300, 340, 400, 420, 480, 540, 560, 660, 800, 920, 880, 980, 940, 1080, 1000, 1160",
      "YARN: see sizing table for yarn requirements",
      "Worsted/aran weight yarn.",
      "Samples shown in De Rerum Natura Gilliatt in Cypress and SweetGeorgia Superwash Worsted Deep Olive, Hush, and Tumbled Stone.",
      "GAUGE:",
      "18 sts & 24 rounds / 4” in stockinette on larger needles.",
      "18 sts & 24 rounds / 4” in stockinette on larger needles.",
      "SUGGESTED NEEDLES:",
      "US #6 / 4mm & US #8 / 5mm",
      "Needles 4 mm",
    ].join("\n") },
    { pageNumber: 3, text: [
      "SIZING TABLE:",
      "ML 40” 4” 13” 20” 12” 17” 14.25” 9” 1100 1260",
    ].join("\n") },
    { pageNumber: 4, text: [
      "This sweater is knit seamlessly in the round from the top down with raglan shaping.",
      "NECKLINE",
      "YOKE",
      "SEPARATE BODY AND SLEEVES",
      "BODY",
      "SLEEVES",
      "NECKLINE RIBBING",
      "FINISHING",
      "Cast on 56 stitches. Work 8 rounds, then repeat 4 times.",
    ].join("\n") },
  ];
  const profileText = [
    "Выбранный размер: ML",
    "Контрольный образец: 20 sts & 26 rows / 10 cm",
    "Спицы 3,5 и 4,5 mm",
    "Yarn: Adaptation Merino",
    "Не интерпретируй числа 77 и 99 как параметры PDF.",
  ].join("\n");
  const sourceText = pages.map((page) => page.text).join("\n\f\n");
  return {
    status: "completed",
    result: {
      schemaVersion: 1,
      combinedText: `${sourceText}\n=== PROJECT DESCRIPTION ===\n${profileText}`,
      files: [
        { sourceFileId: "flax-pdf", order: 0, name: "04-pattern-source.pdf", mediaType: "application/pdf", extractionStatus: "completed", text: sourceText, textLength: sourceText.length, pageCount: pages.length, pages },
        { sourceFileId: "project-description", order: 1, name: "Описание проекта.txt", mediaType: "text/plain", extractionStatus: "completed", text: profileText, textLength: profileText.length },
      ],
      warnings: [],
    },
  };
}

function ledgerEntry(result, semanticType) {
  return result.parameterLedger.find((entry) => entry.semanticType === semanticType);
}

function semantic(result) {
  return {
    id: "semantic-flax", projectId: "project-flax", kind: "PATTERN_SEMANTIC_ANALYSIS", version: 1, analyzerVersion: semanticAnalysis.ANALYZER_VERSION,
    revision: 5, status: "completed", sourceExtractionId: "extract-flax", sourceExtractionRevision: 3,
    sourceImportRevision: 2, sourceFingerprint: "fnv1a32:12345678", result, warnings: [], errors: [],
    createdAt: "2026-08-29T08:00:00.000Z", updatedAt: "2026-08-29T08:02:00.000Z",
    startedAt: "2026-08-29T08:01:00.000Z", completedAt: "2026-08-29T08:02:00.000Z", failedAt: null,
  };
}

test("Flax source becomes a trustworthy parameter ledger without profile contamination", () => {
  const extraction = fixture();
  const result = rules.analyzeExtraction(extraction, { domainBySourceFileId: {
    "flax-pdf": rules.EVIDENCE_DOMAINS.SOURCE_PATTERN_EVIDENCE,
    "project-description": rules.EVIDENCE_DOMAINS.USER_ADAPTATION_PROFILE,
  } });

  assert.deepEqual(result.evidenceDomains.sourcePatternFileIds, ["flax-pdf"]);
  assert.deepEqual(result.evidenceDomains.userAdaptationProfileFileIds, ["project-description"]);
  assert.deepEqual(result.sizing.labels, SIZE_LABELS);
  assert.equal(result.sizing.labels.length, 19);
  assert.deepEqual(result.sizing.measurements.find((entry) => entry.kind === "finished_chest" && entry.sizeLabel === "ML").canonicalValue, { in: 40, cm: 101.6 });
  assert.deepEqual(result.gauge.entries.map((entry) => ({ stitches: entry.stitches, rounds: entry.rounds, per: entry.per, unit: entry.unit })), [{ stitches: 18, rounds: 24, per: 4, unit: "in" }]);
  assert.equal(result.gauge.entries[0].equivalentMentions.length, 1);
  assert.deepEqual(result.tools.needleSizes.map((entry) => entry.canonicalValue), [4, 5]);
  assert.equal(result.tools.needleSizes[0].equivalentMentions.length, 1);
  assert.deepEqual(result.yarn.weights, ["worsted/aran"]);
  assert.deepEqual(result.yarn.names.map((entry) => entry.name), ["De Rerum Natura Gilliatt", "SweetGeorgia Superwash Worsted"]);
  assert.deepEqual(result.construction.sequence, ["neckline", "yoke", "sleeve_body_separation", "body", "sleeves", "finishing"]);

  assert.equal(result.userAdaptationProfile.selectedSize.value, "ML");
  assert.deepEqual(result.userAdaptationProfile.gauge.entries.map((entry) => ({ stitches: entry.stitches, rows: entry.rows, per: entry.per, unit: entry.unit })), [{ stitches: 20, rows: 26, per: 10, unit: "cm" }]);
  assert.deepEqual(result.userAdaptationProfile.tools.needleSizes.map((entry) => entry.canonicalValue), [3.5, 4.5]);
  const canonicalLedgerValues = JSON.stringify(result.parameterLedger.map((entry) => entry.canonicalValue));
  assert.equal(canonicalLedgerValues.includes("Adaptation Merino"), false);
  assert.equal(canonicalLedgerValues.includes("77"), false);
  assert.equal(canonicalLedgerValues.includes("56"), false);

  assert.deepEqual(ledgerEntry(result, "source.sizing.finished_chest").canonicalValue, { sizeLabel: "ML", in: 40, cm: 101.6 });
  assert.deepEqual(ledgerEntry(result, "source.tools.needles").canonicalValue, [4, 5]);
  assert.ok(result.parameterLedger.every((entry) => entry.status === "confirmed" && entry.recognitionReason && entry.provenance.every((fact) => fact.evidenceDomain === "SOURCE_PATTERN_EVIDENCE")));

  const source = semantic(result);
  const initial = review.createInitialState({ projectId: source.projectId, sourceSemanticAnalysisId: source.id, sourceSemanticAnalysisRevision: source.revision, sourceSemanticFingerprint: review.semanticFingerprint(source), sourceContentExtractionRevision: source.sourceExtractionRevision, sourceImportRevision: source.sourceImportRevision }, "2026-08-29T08:03:00.000Z");
  const state = review.buildReviewState(initial, source, "2026-08-29T08:04:00.000Z");
  assert.equal(state.reviewedData.conflictGroups.length, 0);
  assert.equal(state.reviewedData.items.filter((item) => item.metadata.evidenceDomain === "SOURCE_PATTERN_EVIDENCE").length, result.parameterLedger.length);
  assert.ok(state.reviewedData.items.filter((item) => item.metadata.evidenceDomain === "USER_ADAPTATION_PROFILE").length >= 3);
  assert.ok(state.reviewedData.items.every((item) => item.decision === "accepted"));
  assert.equal(state.validation.canConfirm, true);
  assert.equal(state.status, "ready_to_confirm");

  const confirmed = review.confirmState(state, source, "2026-08-29T08:05:00.000Z");
  const authoritative = review.authoritativeConfirmedSnapshot(confirmed);
  assert.equal(authoritative.confirmedSnapshotContractVersion, 2);
  assert.equal(authoritative.sourcePatternEvidence.evidenceDomain, "SOURCE_PATTERN_EVIDENCE");
  assert.equal(authoritative.userAdaptationProfile.evidenceDomain, "USER_ADAPTATION_PROFILE");
  assert.equal(authoritative.userAdaptationProfile.selectedSize.value, "ML");
  assert.equal(authoritative.userAdaptationProfile.gauge[0].stitches, 20);
  assert.deepEqual(authoritative.userAdaptationProfile.needles.map((entry) => entry.canonicalValue), [3.5, 4.5]);

  const reopened = JSON.parse(JSON.stringify(state));
  review.requireValidState(reopened);
  assert.deepEqual(reopened.reviewedData, state.reviewedData);

  const view = experience.buildViewModel({
    project: { project_id: "project-flax", title: "Flax ML", draft_input: {} },
    semantic: { status: "completed", result },
    intent: { fieldStatus: {}, assumptions: [], missingInformation: [], preferences: {} },
    importState: { materials: [{ id: "flax-pdf", type: "pdf" }, { id: "project-description", type: "text" }] },
  });
  const visibleFacts = new Map([...view.confirmed, ...view.assumed].map((entry) => [entry.label, entry.value]));
  assert.equal(visibleFacts.get("Источник · размеры").startsWith("19: 0-6 mo, 6-12 mo"), true);
  assert.equal(visibleFacts.get("Источник · ML"), "ML — 40 in / 101.6 cm");
  assert.equal(visibleFacts.get("Источник · плотность"), "18 п. + 24 круг. р. на 4 in");
  assert.equal(visibleFacts.get("Источник · спицы"), "4, 5 mm");
  assert.equal(visibleFacts.get("Адаптация · выбранный размер"), "ML");
  assert.equal(visibleFacts.get("Адаптация · плотность"), "20 п. + 26 р. на 10 cm");
  assert.equal(visibleFacts.get("Адаптация · спицы"), "3.5, 4.5 mm");
  assert.equal(view.conflicts.length, 0);
});

test("analyzer version invalidates a legacy result and the domain map classifies the saved project description", () => {
  const extraction = fixture();
  assert.deepEqual(semanticAnalysis.buildEvidenceDomainMap({ draft_input: { material_intake: { description: "  Выбранный размер: ML\nКонтрольный образец: 20 sts & 26 rows / 10 cm\nСпицы 3,5 и 4,5 mm\nYarn: Adaptation Merino\nНе интерпретируй числа 77 и 99 как параметры PDF.  " } } }, extraction), {
    "flax-pdf": "SOURCE_PATTERN_EVIDENCE",
    "project-description": "USER_ADAPTATION_PROFILE",
  });

  const legacy = semantic(rules.analyzeExtraction(extraction, { domainBySourceFileId: { "project-description": "USER_ADAPTATION_PROFILE" } }));
  delete legacy.analyzerVersion;
  const inspected = semanticAnalysis.inspectAggregate({
    project: { project_id: legacy.projectId, active_calculation_id: "calculation-flax" },
    calculations: [{ calculation_id: "calculation-flax" }],
    progress: [{ kind: "PATTERN_SEMANTIC_ANALYSIS", calculation_id: "calculation-flax", epoch: 1, state: legacy }],
  });
  assert.equal(inspected.state, "analyzer_stale");
  assert.equal(inspected.diagnostic.code, "SEMANTIC_ANALYZER_VERSION_MISMATCH");
  const failed = semanticAnalysis.failureState(legacy, inspected.diagnostic, "2026-08-29T08:04:30.000Z");
  assert.equal(failed.analyzerVersion, semanticAnalysis.ANALYZER_VERSION);
  assert.equal(semanticAnalysis.startState(failed, "2026-08-29T08:05:00.000Z").analyzerVersion, semanticAnalysis.ANALYZER_VERSION);
});
