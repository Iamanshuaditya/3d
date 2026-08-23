import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE_TEMPLATE_VERSIONS } from "@/lib/templates/fixtures";
import { TemplateDomainError } from "@/platform/templates/errors";
import { personalizationValue } from "@/platform/templates/personalization";
import {
  importPersonalizationCsv,
  personalizedTemplateVariant,
  personalizedTemplateVariants,
} from "@/server/templates/personalization-dataset";
import type { DesignDocument, TextElement } from "@/types/configurator";

const template = CODE_TEMPLATE_VERSIONS["team-launch-shirt@1"];

function boundText(document: DesignDocument, key: string): TextElement {
  const element = Object.values(document.surfaces)
    .flatMap((surface) => surface.elements)
    .find((candidate) => candidate.type === "text" && candidate.binding?.key === key);
  assert.ok(element && element.type === "text", `missing bound text ${key}`);
  return element;
}

test("mapped CSV rows become deterministic normal-document variants", () => {
  const imported = importPersonalizationCsv({
    template,
    source: [
      "Full Name,Tag Line,Internal ID",
      '"ACME, Inc.","Build ""great"" things",001',
      "Beta Labs,Scale safely,002",
    ].join("\r\n"),
    mapping: {
      "Full Name": "company.name",
      "Tag Line": "company.tagline",
      "Internal ID": null,
    },
  });

  assert.equal(imported.report.passed, true);
  assert.equal(imported.report.rowCount, 2);
  assert.equal(imported.report.issueCount, 0);
  assert.ok(imported.dataset);
  assert.match(imported.dataset.id, /^personalization-dataset-[a-f0-9]{24}$/);
  assert.match(imported.dataset.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(imported.dataset.columns, [
    { sourceColumn: "Full Name", fieldKey: "company.name" },
    { sourceColumn: "Tag Line", fieldKey: "company.tagline" },
    { sourceColumn: "Internal ID", fieldKey: null },
  ]);
  assert.equal(
    personalizationValue(imported.dataset.rows[0].personalization, "company.name"),
    "ACME, Inc.",
  );
  assert.equal(
    personalizationValue(imported.dataset.rows[0].personalization, "company.tagline"),
    'Build "great" things',
  );

  const first = personalizedTemplateVariant(template, imported.dataset, 0);
  const repeated = personalizedTemplateVariant(template, imported.dataset, 0);
  assert.equal(first.id, repeated.id);
  assert.equal(first.sourceRowNumber, 2);
  assert.equal(boundText(first.design, "company.name").text, "ACME, Inc.");
  assert.equal(boundText(first.design, "company.tagline").text, 'Build "great" things');
  assert.equal(boundText(template.designDocumentTemplate, "company.name").text, "NORTHSTAR");

  const variants = [...personalizedTemplateVariants(template, imported.dataset)];
  assert.equal(variants.length, 2);
  assert.equal(boundText(variants[1].design, "company.name").text, "Beta Labs");
});

test("field-key headers, UTF-8 BOM, multiline values, and formulas remain plain text", () => {
  const csv = "\uFEFFcompany.name,company.tagline\r\n" +
    'Northstar,"First line\nSecond line"\r\n' +
    'Literal,"=HYPERLINK(""https://invalid.example"",""text"")"\r\n';
  const imported = importPersonalizationCsv({ template, source: csv });

  assert.equal(imported.report.passed, true);
  assert.ok(imported.dataset);
  assert.equal(imported.dataset.rows[0].sourceRowNumber, 2);
  assert.equal(imported.dataset.rows[1].sourceRowNumber, 4);
  assert.equal(
    personalizationValue(imported.dataset.rows[0].personalization, "company.tagline"),
    "First line\nSecond line",
  );
  assert.equal(
    personalizationValue(imported.dataset.rows[1].personalization, "company.tagline"),
    '=HYPERLINK("https://invalid.example","text")',
  );
  assert.equal(
    boundText(
      personalizedTemplateVariant(template, imported.dataset, 1).design,
      "company.tagline",
    ).text,
    '=HYPERLINK("https://invalid.example","text")',
  );
});

test("row validation is all-or-nothing and reports source rows", () => {
  const imported = importPersonalizationCsv({
    template,
    source: [
      "Name,Tagline",
      ",A valid tagline",
      `Valid,${"x".repeat(65)}`,
      "Only one cell",
    ].join("\n"),
    mapping: {
      Name: "company.name",
      Tagline: "company.tagline",
    },
  });

  assert.equal(imported.dataset, null);
  assert.equal(imported.report.passed, false);
  assert.equal(imported.report.rowCount, 3);
  assert.equal(imported.report.issueCount, 3);
  assert.deepEqual(
    imported.report.issues.map((value) => [value.code, value.sourceRowNumber]),
    [
      ["PLACEHOLDER_REQUIRED", 2],
      ["PLACEHOLDER_TOO_LONG", 3],
      ["PERSONALIZATION_CSV_ROW_WIDTH_INVALID", 4],
    ],
  );
});

test("reports are bounded even when a large batch has many invalid rows", () => {
  const rows = Array.from({ length: 105 }, (_, index) => `,row-${index + 1}`);
  const imported = importPersonalizationCsv({
    template,
    source: ["Name,Ignore", ...rows].join("\n"),
    mapping: { Name: "company.name", Ignore: null },
  });

  assert.equal(imported.dataset, null);
  assert.equal(imported.report.rowCount, 105);
  assert.equal(imported.report.issueCount, 105);
  assert.equal(imported.report.issues.length, 100);
  assert.equal(imported.report.issuesTruncated, true);
});

test("malformed encoding, CSV structure, and ambiguous mappings fail closed", () => {
  const invalidUtf8 = importPersonalizationCsv({
    template,
    source: new Uint8Array([0xff, 0xfe, 0xfd]),
  });
  assert.equal(invalidUtf8.report.issues[0].code, "PERSONALIZATION_CSV_ENCODING_INVALID");

  const unterminated = importPersonalizationCsv({
    template,
    source: 'company.name\n"unfinished',
  });
  assert.equal(
    unterminated.report.issues[0].code,
    "PERSONALIZATION_CSV_UNTERMINATED_QUOTE",
  );

  const tooManyRows = importPersonalizationCsv({
    template,
    source: [
      "company.name,company.tagline",
      ...Array.from({ length: 10_001 }, (_, index) => `Company ${index},Tagline`),
    ].join("\n"),
  });
  assert.equal(
    tooManyRows.report.issues[0].code,
    "PERSONALIZATION_CSV_TOO_MANY_ROWS",
  );

  const ambiguous = importPersonalizationCsv({
    template,
    source: "Name,Alias,Unexpected\nAlpha,Beta,Ignored",
    mapping: {
      Name: "company.name",
      Alias: "company.name",
      Missing: "company.tagline",
    },
  });
  assert.equal(ambiguous.dataset, null);
  assert.ok(ambiguous.report.issues.some(
    (value) => value.code === "PERSONALIZATION_CSV_FIELD_DUPLICATED",
  ));
  assert.ok(ambiguous.report.issues.some(
    (value) => value.code === "PERSONALIZATION_CSV_MAPPING_MISSING",
  ));
  assert.ok(ambiguous.report.issues.some(
    (value) => value.code === "PERSONALIZATION_CSV_MAPPING_UNUSED",
  ));
});

test("datasets cannot be applied to another template or an absent row", () => {
  const imported = importPersonalizationCsv({
    template,
    source: "company.name,company.tagline\nNorthstar,Launch",
  });
  assert.ok(imported.dataset);
  const otherTemplate = CODE_TEMPLATE_VERSIONS["botanical-bottle-label@1"];

  assert.throws(
    () => personalizedTemplateVariant(otherTemplate, imported.dataset!, 0),
    (error) =>
      error instanceof TemplateDomainError &&
      error.code === "PERSONALIZATION_DATASET_TEMPLATE_MISMATCH",
  );
  assert.throws(
    () => personalizedTemplateVariant(template, imported.dataset!, 1),
    (error) =>
      error instanceof TemplateDomainError &&
      error.code === "PERSONALIZATION_ROW_NOT_FOUND",
  );
});
