import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AsyncApplyButton,
  createStructuredFilter,
  defaultFilterOperator,
  filterInputKind,
  filterOperatorsForField,
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
});

function field(
  name: string,
  physicalType: string,
  logicalType?: string,
): StructuredField {
  return { name, physicalType, logicalType, nullable: true };
}
