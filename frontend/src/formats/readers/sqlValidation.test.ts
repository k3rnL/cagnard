import { describe, expect, it } from "vitest";

import { validateReadOnlySQL } from "./sqlValidation";

describe("structured SQL validation", () => {
  it.each([
    "SELECT * FROM data",
    "WITH totals AS (SELECT category, sum(amount) total FROM data GROUP BY category) SELECT * FROM totals",
    "SELECT left_row.id FROM data left_row JOIN data right_row ON left_row.id = right_row.id",
    "SELECT row_number() OVER (ORDER BY id), id FROM data",
    "SELECT * FROM data WHERE id IN (SELECT id FROM data WHERE active)",
    "SELECT id FROM data UNION ALL SELECT id FROM data",
		"SELECT CASE WHEN active THEN upper(name) ELSE coalesce(name, 'unknown') END FROM data",
		"SELECT category, avg(score), count(*) FROM data GROUP BY category HAVING count(*) > 1 ORDER BY avg(score) DESC",
		"SELECT json_extract(profile, '$.city'), date_trunc('month', created_at) FROM data",
  ])("allows bounded analytical reads: %s", (sql) => {
    expect(validateReadOnlySQL(sql).sql).toBe(sql);
  });

  it.each([
    "DELETE FROM data",
    "UPDATE data SET id = 1",
    "CREATE TABLE copied AS SELECT * FROM data",
    "SELECT * FROM secrets",
    "SELECT * FROM main.data",
    "SELECT * FROM read_csv('https://example.test/private.csv')",
    "SELECT query('SELECT * FROM data') FROM data",
    "SELECT * FROM data; SELECT * FROM data",
    "VALUES (1)",
		"WITH RECURSIVE forever AS (SELECT id FROM data UNION ALL SELECT id FROM forever) SELECT * FROM forever",
		"SELECT * INTO copied FROM data",
		"SELECT * FROM data FOR UPDATE",
		"SELECT current_setting('home_directory') FROM data",
		"SELECT read_text('/private/file') FROM data",
		"SELECT unknown_extension_function(id) FROM data",
		"SELECT pg_catalog.count(*) FROM data",
		"SELECT * FROM duckdb_settings()",
		"SELECT * FROM glob('/private/*')",
  ])("rejects statements outside the data scope: %s", (sql) => {
    expect(() => validateReadOnlySQL(sql)).toThrow();
  });

  it("requires the source relation even when the query only uses literals", () => {
    expect(() => validateReadOnlySQL("SELECT 1")).toThrow(/must read from/i);
  });

	it("enforces the configured SQL text ceiling", () => {
		expect(() => validateReadOnlySQL("SELECT * FROM data", 10)).toThrow(/limited/i);
	});
});
