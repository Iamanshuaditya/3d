import { createHash } from "node:crypto";
import type { PersonalizationData } from "@/types/configurator";
import { canonicalJson } from "@/server/persistence/canonical-json";
import { TemplateDomainError } from "@/platform/templates/errors";
import {
  applyPersonalization,
  mergePersonalizationData,
  parsePersonalizationData,
  validateFieldKey,
  validatePlaceholderValues,
} from "@/platform/templates/personalization";
import type {
  DesignTemplateVersion,
  PersonalizationDataset,
  PersonalizationDatasetColumn,
  PersonalizationDatasetImportResult,
  PersonalizationDatasetIssue,
  PersonalizedTemplateVariant,
} from "@/platform/templates/types";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_COLUMNS = 256;
const MAX_ROWS = 10_000;
const MAX_CELL_CHARACTERS = 2_000;
const MAX_ISSUES = 100;

export type PersonalizationCsvMapping = Record<string, string | null>;

type ParsedCsv = {
  rows: string[][];
  sourceRowNumbers: number[];
};

function issue(
  code: string,
  message: string,
  sourceRowNumber: number | null,
  details: Partial<Pick<PersonalizationDatasetIssue, "sourceColumn" | "fieldKey">> = {},
): PersonalizationDatasetIssue {
  return { code, message, sourceRowNumber, ...details };
}

function decodeCsv(source: string | Uint8Array) {
  if (typeof source === "string") {
    if (Buffer.byteLength(source, "utf8") > MAX_CSV_BYTES) {
      throw new TemplateDomainError(
        "PERSONALIZATION_CSV_TOO_LARGE",
        `CSV data cannot exceed ${MAX_CSV_BYTES} bytes.`,
      );
    }
    return source.startsWith("\uFEFF") ? source.slice(1) : source;
  }
  if (source.byteLength > MAX_CSV_BYTES) {
    throw new TemplateDomainError(
      "PERSONALIZATION_CSV_TOO_LARGE",
      `CSV data cannot exceed ${MAX_CSV_BYTES} bytes.`,
    );
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch {
    throw new TemplateDomainError(
      "PERSONALIZATION_CSV_ENCODING_INVALID",
      "CSV data must be valid UTF-8.",
    );
  }
  return decoded.startsWith("\uFEFF") ? decoded.slice(1) : decoded;
}

function parseCsv(source: string): ParsedCsv {
  const rows: string[][] = [];
  const sourceRowNumbers: number[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  let sourceRowNumber = 1;
  let rowStartNumber = 1;

  const pushCell = () => {
    if (cell.length > MAX_CELL_CHARACTERS) {
      throw new TemplateDomainError(
        "PERSONALIZATION_CSV_CELL_TOO_LONG",
        `CSV row ${sourceRowNumber} contains a cell longer than ${MAX_CELL_CHARACTERS} characters.`,
        { sourceRowNumber },
      );
    }
    row.push(cell.trim());
    cell = "";
    afterQuote = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value !== "")) {
      rows.push(row);
      sourceRowNumbers.push(rowStartNumber);
      if (rows.length > MAX_ROWS + 1) {
        throw new TemplateDomainError(
          "PERSONALIZATION_CSV_TOO_MANY_ROWS",
          `CSV data cannot contain more than ${MAX_ROWS} data rows.`,
        );
      }
    }
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
        if (character === "\n") sourceRowNumber += 1;
        if (cell.length > MAX_CELL_CHARACTERS) {
          throw new TemplateDomainError(
            "PERSONALIZATION_CSV_CELL_TOO_LONG",
            `CSV row ${rowStartNumber} contains a cell longer than ${MAX_CELL_CHARACTERS} characters.`,
            { sourceRowNumber: rowStartNumber },
          );
        }
      }
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new TemplateDomainError(
        "PERSONALIZATION_CSV_MALFORMED",
        `CSV row ${rowStartNumber} has characters after a closing quote.`,
        { sourceRowNumber: rowStartNumber },
      );
    }
    if (character === '"') {
      if (cell.length || afterQuote) {
        throw new TemplateDomainError(
          "PERSONALIZATION_CSV_MALFORMED",
          `CSV row ${rowStartNumber} has an unexpected quote.`,
          { sourceRowNumber: rowStartNumber },
        );
      }
      quoted = true;
    } else if (character === ",") {
      pushCell();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      pushRow();
      sourceRowNumber += 1;
      rowStartNumber = sourceRowNumber;
    } else {
      cell += character;
      if (cell.length > MAX_CELL_CHARACTERS) {
        throw new TemplateDomainError(
          "PERSONALIZATION_CSV_CELL_TOO_LONG",
          `CSV row ${rowStartNumber} contains a cell longer than ${MAX_CELL_CHARACTERS} characters.`,
          { sourceRowNumber: rowStartNumber },
        );
      }
    }
  }
  if (quoted) {
    throw new TemplateDomainError(
      "PERSONALIZATION_CSV_UNTERMINATED_QUOTE",
      `CSV row ${rowStartNumber} has an unterminated quoted cell.`,
      { sourceRowNumber: rowStartNumber },
    );
  }
  if (cell.length || row.length || afterQuote) pushRow();
  return { rows, sourceRowNumbers };
}

function setFieldValue(target: PersonalizationData, fieldKey: string, value: string) {
  const segments = fieldKey.split(".");
  let current = target;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      const existing = current[segment];
      if (existing !== undefined && existing !== null && typeof existing === "object") {
        throw new TemplateDomainError(
          "PERSONALIZATION_FIELD_CONFLICT",
          `Personalization field ${fieldKey} conflicts with another mapped field.`,
        );
      }
      current[segment] = value;
      return;
    }
    const existing = current[segment];
    if (existing !== undefined && (existing === null || typeof existing !== "object")) {
      throw new TemplateDomainError(
        "PERSONALIZATION_FIELD_CONFLICT",
        `Personalization field ${fieldKey} conflicts with another mapped field.`,
      );
    }
    const nested: PersonalizationData = existing && typeof existing === "object"
      ? existing
      : {};
    current[segment] = nested;
    current = nested;
  }
}

function datasetId(
  templateVersionId: string,
  sha256: string,
  columns: PersonalizationDatasetColumn[],
) {
  return `personalization-dataset-${createHash("sha256")
    .update(canonicalJson({ templateVersionId, sha256, columns }))
    .digest("hex")
    .slice(0, 24)}`;
}

export function importPersonalizationCsv(input: {
  template: DesignTemplateVersion;
  source: string | Uint8Array;
  mapping?: PersonalizationCsvMapping;
}): PersonalizationDatasetImportResult {
  const issues: PersonalizationDatasetIssue[] = [];
  let issueCount = 0;
  const addIssue = (value: PersonalizationDatasetIssue) => {
    issueCount += 1;
    if (issues.length < MAX_ISSUES) issues.push(value);
  };
  let text: string;
  let parsed: ParsedCsv;
  try {
    text = decodeCsv(input.source);
    parsed = parseCsv(text);
  } catch (error) {
    const domain = error instanceof TemplateDomainError
      ? error
      : new TemplateDomainError(
          "PERSONALIZATION_CSV_INVALID",
          "CSV data could not be parsed.",
        );
    const sourceRowNumber = typeof domain.details?.sourceRowNumber === "number"
      ? domain.details.sourceRowNumber
      : null;
    return {
      dataset: null,
      report: {
        passed: false,
        rowCount: 0,
        issueCount: 1,
        issues: [issue(domain.code, domain.message, sourceRowNumber)],
        issuesTruncated: false,
      },
    };
  }
  if (!parsed.rows.length) {
    return {
      dataset: null,
      report: {
        passed: false,
        rowCount: 0,
        issueCount: 1,
        issues: [issue(
          "PERSONALIZATION_CSV_EMPTY",
          "CSV data must contain a header and at least one data row.",
          null,
        )],
        issuesTruncated: false,
      },
    };
  }
  const headers = parsed.rows[0];
  const headerSourceRowNumber = parsed.sourceRowNumbers[0];
  const dataRows = parsed.rows.slice(1);
  const dataSourceRows = parsed.sourceRowNumbers.slice(1);
  if (!dataRows.length) {
    addIssue(issue(
      "PERSONALIZATION_CSV_EMPTY",
      "CSV data must contain at least one data row.",
      null,
    ));
  }
  if (!headers.length || headers.length > MAX_COLUMNS) {
    addIssue(issue(
      "PERSONALIZATION_CSV_COLUMNS_INVALID",
      `CSV data must contain between 1 and ${MAX_COLUMNS} columns.`,
      headerSourceRowNumber,
    ));
  }
  const sourceColumns = new Set<string>();
  const fieldKeys = new Set<string>();
  const placeholders = new Set(input.template.placeholderDefinitions.map((value) => value.key));
  const mappingEntries = input.mapping ? new Map(Object.entries(input.mapping)) : null;
  const columns: PersonalizationDatasetColumn[] = headers.map((sourceColumn) => {
    if (!sourceColumn || sourceColumn.length > 128 || sourceColumns.has(sourceColumn)) {
      addIssue(issue(
        "PERSONALIZATION_CSV_HEADER_INVALID",
        `CSV header ${sourceColumn || "(blank)"} is invalid or duplicated.`,
        headerSourceRowNumber,
        { sourceColumn },
      ));
    }
    sourceColumns.add(sourceColumn);
    let fieldKey: string | null | undefined = mappingEntries
      ? mappingEntries.get(sourceColumn)
      : sourceColumn;
    if (mappingEntries && !mappingEntries.has(sourceColumn)) {
      addIssue(issue(
        "PERSONALIZATION_CSV_MAPPING_MISSING",
        `CSV column ${sourceColumn} must be mapped or explicitly ignored.`,
        headerSourceRowNumber,
        { sourceColumn },
      ));
      fieldKey = null;
    }
    if (fieldKey === undefined) {
      addIssue(issue(
        "PERSONALIZATION_CSV_MAPPING_INVALID",
        `CSV column ${sourceColumn} has an invalid mapping.`,
        headerSourceRowNumber,
        { sourceColumn },
      ));
      fieldKey = null;
    }
    if (fieldKey !== null && fieldKey !== undefined) {
      try {
        validateFieldKey(fieldKey);
      } catch {
        addIssue(issue(
          "PERSONALIZATION_CSV_FIELD_INVALID",
          `CSV column ${sourceColumn} maps to an invalid personalization field.`,
          headerSourceRowNumber,
          { sourceColumn, fieldKey },
        ));
      }
      if (!placeholders.has(fieldKey)) {
        addIssue(issue(
          "PERSONALIZATION_CSV_FIELD_UNKNOWN",
          `CSV column ${sourceColumn} does not map to a template placeholder.`,
          headerSourceRowNumber,
          { sourceColumn, fieldKey },
        ));
      }
      if (fieldKeys.has(fieldKey)) {
        addIssue(issue(
          "PERSONALIZATION_CSV_FIELD_DUPLICATED",
          `Multiple CSV columns map to ${fieldKey}.`,
          headerSourceRowNumber,
          { sourceColumn, fieldKey },
        ));
      }
      fieldKeys.add(fieldKey);
    }
    return { sourceColumn, fieldKey: fieldKey ?? null };
  });
  if (mappingEntries) {
    for (const sourceColumn of mappingEntries.keys()) {
      if (!sourceColumns.has(sourceColumn)) {
        addIssue(issue(
          "PERSONALIZATION_CSV_MAPPING_UNUSED",
          `Mapping source ${sourceColumn} is not present in the CSV header.`,
          headerSourceRowNumber,
          { sourceColumn },
        ));
      }
    }
  }

  const rows: PersonalizationDataset["rows"] = [];
  for (const [rowIndex, values] of dataRows.entries()) {
    const sourceRowNumber = dataSourceRows[rowIndex];
    if (values.length !== headers.length) {
      addIssue(issue(
        "PERSONALIZATION_CSV_ROW_WIDTH_INVALID",
        `CSV row ${sourceRowNumber} has ${values.length} cells; expected ${headers.length}.`,
        sourceRowNumber,
      ));
      continue;
    }
    const override: PersonalizationData = {};
    try {
      for (const [columnIndex, column] of columns.entries()) {
        if (column.fieldKey) setFieldValue(override, column.fieldKey, values[columnIndex]);
      }
      const personalization = mergePersonalizationData(
        parsePersonalizationData(input.template.defaultPersonalization),
        parsePersonalizationData(override),
      );
      validatePlaceholderValues(input.template.placeholderDefinitions, personalization);
      rows.push({ rowIndex, sourceRowNumber, personalization });
    } catch (error) {
      const domain = error instanceof TemplateDomainError
        ? error
        : new TemplateDomainError(
            "PERSONALIZATION_ROW_INVALID",
            `CSV row ${sourceRowNumber} contains invalid personalization.`,
          );
      addIssue(issue(
        domain.code,
        domain.message,
        sourceRowNumber,
        typeof domain.details?.key === "string" ? { fieldKey: domain.details.key } : {},
      ));
    }
  }

  const sha256 = createHash("sha256").update(text, "utf8").digest("hex");
  const passed = issueCount === 0;
  const dataset: PersonalizationDataset | null = passed
    ? {
        id: datasetId(input.template.id, sha256, columns),
        templateVersionId: input.template.id,
        sha256,
        columns,
        rows,
      }
    : null;
  return {
    dataset,
    report: {
      passed,
      rowCount: dataRows.length,
      issueCount,
      issues,
      issuesTruncated: issueCount > issues.length,
    },
  };
}

export function personalizedTemplateVariant(
  template: DesignTemplateVersion,
  dataset: PersonalizationDataset,
  rowIndex: number,
): PersonalizedTemplateVariant {
  if (dataset.templateVersionId !== template.id) {
    throw new TemplateDomainError(
      "PERSONALIZATION_DATASET_TEMPLATE_MISMATCH",
      "Personalization dataset belongs to another template version.",
    );
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= dataset.rows.length) {
    throw new TemplateDomainError(
      "PERSONALIZATION_ROW_NOT_FOUND",
      "Personalization dataset row was not found.",
    );
  }
  const row = dataset.rows[rowIndex];
  const id = `personalized-variant-${createHash("sha256")
    .update(canonicalJson({
      templateVersionId: template.id,
      datasetId: dataset.id,
      rowIndex: row.rowIndex,
      personalization: row.personalization,
    }))
    .digest("hex")
    .slice(0, 24)}`;
  return {
    id,
    templateVersionId: template.id,
    datasetId: dataset.id,
    rowIndex: row.rowIndex,
    sourceRowNumber: row.sourceRowNumber,
    personalization: structuredClone(row.personalization),
    design: applyPersonalization(
      template.designDocumentTemplate,
      row.personalization,
    ),
  };
}

/** Lazy iteration keeps large datasets from duplicating every document in memory. */
export function* personalizedTemplateVariants(
  template: DesignTemplateVersion,
  dataset: PersonalizationDataset,
): Generator<PersonalizedTemplateVariant> {
  for (let index = 0; index < dataset.rows.length; index += 1) {
    yield personalizedTemplateVariant(template, dataset, index);
  }
}
