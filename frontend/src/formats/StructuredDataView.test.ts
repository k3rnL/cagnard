import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AsyncApplyButton,
  createStructuredFilter,
  defaultFilterOperator,
  filterInputKind,
  filterOperatorsForField,
  highlightSQLSyntax,
  insertCurrentViewSQL,
  SQLCodeEditor,
} from "./StructuredDataView";
import type { StructuredField } from "./models";

const fields: StructuredField[] = [
  field("name", "VARCHAR", "UTF8"),
  field("amount", "INT64", "DECIMAL(12,2)"),
  field("active", "BOOLEAN"),
];

describe("structured-data query controls", () => {
  it("offers operators and defaults that match each field type", () => {
    expect(filterInputKind(fields[0])).toBe("text");
    expect(defaultFilterOperator(fields[0])).toBe("contains");
    expect(filterOperatorsForField(fields[0])).toEqual([
      "contains",
      "eq",
      "neq",
      "is-null",
    ]);

    expect(filterInputKind(fields[1])).toBe("number");
    expect(defaultFilterOperator(fields[1])).toBe("eq");
    expect(filterOperatorsForField(fields[1])).toEqual([
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "is-null",
    ]);

    expect(filterInputKind(fields[2])).toBe("boolean");
    expect(defaultFilterOperator(fields[2])).toBe("eq");
    expect(filterOperatorsForField(fields[2])).toEqual([
      "eq",
      "neq",
      "is-null",
    ]);
  });

  it("accepts a value-free is-null filter", () => {
    expect(createStructuredFilter(fields, "amount", "is-null", "")).toEqual({
      column: "amount",
      operator: "is-null",
    });
  });

  it("rejects incomplete value filters and coerces typed values", () => {
    expect(createStructuredFilter(fields, "name", "contains", "   "))
      .toBeUndefined();
    expect(createStructuredFilter(fields, "", "eq", "value")).toBeUndefined();
    expect(createStructuredFilter(fields, "amount", "gte", "42")).toEqual({
      column: "amount",
      operator: "gte",
      value: 42,
    });
    expect(createStructuredFilter(fields, "active", "eq", "false")).toEqual({
      column: "active",
      operator: "eq",
      value: false,
    });
  });

  it("keeps a running apply action in place and exposes cancellation", () => {
    const markup = renderToStaticMarkup(createElement(AsyncApplyButton, {
      disabled: false,
      label: "Apply filters",
      running: true,
      runningLabel: "Applying filters",
      stopLabel: "Stop applying filters",
      onApply: () => undefined,
      onCancel: () => undefined
    }));

    expect(markup).toContain("structured-apply-button running");
    expect(markup).toContain('aria-label="Stop applying filters"');
    expect(markup).toContain("structured-spinner-icon");
    expect(markup).toContain("structured-stop-icon");
    expect(markup).toContain("Applying filters");
  });

  it("inserts an editable SQL representation of the current view", () => {
    expect(insertCurrentViewSQL({
      projection: ["name", "amount"],
      filters: [{ column: "name", operator: "contains", value: "O'Reilly" }],
      sorts: [{ column: "amount", direction: "desc" }],
    }, fields.map((candidate) => candidate.name))).toBe(
      `SELECT "name", "amount"\nFROM data\nWHERE "name"::VARCHAR ILIKE '%O''Reilly%' ESCAPE '\\'\nORDER BY "amount" DESC`,
    );
  });

  it("adds SQL syntax tokens while preserving the native editor value", () => {
    const sql = "SELECT name, 42 AS answer FROM data WHERE active = true AND name = 'Alice'";
    const highlighted = highlightSQLSyntax(sql);
    const markup = renderToStaticMarkup(createElement(SQLCodeEditor, {
      sql,
      setSQL: () => undefined,
    }));

    expect(highlighted).toContain("hljs-keyword");
    expect(highlighted).toContain("hljs-number");
    expect(highlighted).toContain("hljs-string");
    expect(markup).toContain('aria-label="SQL query"');
    expect(markup).toContain("SELECT name, 42 AS answer FROM data");
  });
});

function field(
  name: string,
  physicalType: string,
  logicalType?: string,
): StructuredField {
  return { name, physicalType, logicalType, nullable: true };
}
