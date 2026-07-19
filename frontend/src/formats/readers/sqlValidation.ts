import { parse } from "pgsql-ast-parser";

import { StructuredReaderError } from "./shared";

const defaultMaximumSQLCharacters = 100_000;
const selectableTypes = new Set(["select", "union", "union all", "with"]);
const allowedSelectKeys = new Set([
  "type",
  "columns",
  "from",
  "where",
  "groupBy",
  "having",
  "orderBy",
  "limit",
  "distinct",
]);
const allowedASTNodeTypes = new Set([
  ...selectableTypes,
  "table",
  "statement",
  "ref",
  "call",
  "integer",
  "numeric",
  "string",
  "boolean",
  "null",
  "binary",
  "unary",
  "ternary",
  "cast",
  "case",
  "list",
  "array",
  "array select",
  "arrayIndex",
  "member",
  "constant",
  "keyword",
  "extract",
  "overlay",
  "substring",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "CROSS JOIN",
]);
const allowedFunctions = new Set(`
  abs acos acosh any_value approx_count_distinct approx_quantile arg_max arg_min
  array_agg array_contains array_cosine_distance array_cosine_similarity array_cross_product
  array_distance array_dot_product array_extract array_has array_indexof array_length array_position
  array_resize array_slice array_sort array_transform array_unique array_value ascii asin asinh atan
  atan2 atanh avg bit_and bit_count bit_or bit_xor bitstring_agg bool_and bool_or cardinality cbrt
  ceil ceiling char_length character_length chr coalesce concat concat_ws contains corr cos cosh cot
  count covar_pop covar_samp cume_dist current_date current_localtime current_localtimestamp
  current_time current_timestamp date_diff date_part date_sub date_trunc day dayname decade degrees
  dense_rank editdist3 entropy epoch epoch_ms epoch_ns epoch_us exp extract factorial favg first first_value
  floor format fsum gamma geomean greatest hash hex histogram histogram_exact hour if ifnull ilike_escape
  isfinite isinf isnan json_array json_array_length json_contains json_extract json_extract_path
  json_extract_path_text json_extract_string json_keys json_merge_patch json_object json_structure
  json_transform json_transform_strict json_type json_valid json_value lag last last_day last_value lcase
  lead least left length levenshtein list list_aggr list_aggregate list_apply list_concat list_contains
  list_cosine_distance list_cosine_similarity list_distance list_distinct list_dot_product list_element
  list_extract list_filter list_grade_up list_has list_indexof list_inner_product list_intersect list_pack
  list_position list_reduce list_resize list_reverse list_reverse_sort list_select list_slice list_sort
  list_transform list_unique list_value ln log log10 log2 lower lpad ltrim mad make_date make_time
  make_timestamp make_timestamp_ms make_timestamp_ns map map_concat map_contains map_entries map_extract
  map_extract_value map_from_entries map_keys map_values max md5 median microsecond millenium millisecond
  min minute mode month monthname nfc_normalize not_ilike_escape not_like_escape now nth_value ntile
  nullif octet_length overlay parse_dirname parse_filename parse_path parse_query_string parse_url part
  percent_rank pi position pow power prefix printf product quarter quantile quantile_cont quantile_disc
  radians rank regexp_escape regexp_extract regexp_extract_all regexp_full_match regexp_matches
  regexp_replace regexp_split_to_array repeat replace reverse right round row_number rpad rtrim second
  sha256 sign sin sinh split_part sqrt starts_with stddev stddev_pop stddev_samp string_agg string_split
  string_split_regex string_to_array strip_accents strlen strpos struct_extract struct_insert struct_pack
  substr substring suffix sum tan tanh time_bucket to_base to_centuries to_days to_decades to_hours
  to_json to_microseconds to_millennia to_milliseconds to_minutes to_months to_quarters to_seconds
  to_weeks to_years translate trim trunc typeof ucase unicode union_extract unnest upper url_decode
  url_encode value_counts var_pop var_samp variance week weekday weighted_avg year yearweek
`.trim().split(/\s+/));

export interface ValidatedSQL {
  sql: string;
  referencesData: boolean;
}

export function validateReadOnlySQL(
  input: string,
  maximumSQLCharacters = defaultMaximumSQLCharacters,
): ValidatedSQL {
  const sql = input.trim().replace(/;+\s*$/, "");
  if (!sql) throw invalid("Enter a SELECT query to run.");
  if (sql.length > maximumSQLCharacters) {
    throw invalid(`SQL text is limited to ${maximumSQLCharacters.toLocaleString()} characters.`);
  }

  let statements: unknown[];
  try {
    statements = parse(sql) as unknown[];
  } catch (caught) {
    throw invalid("The SQL query could not be parsed.", caught);
  }
  if (statements.length !== 1) {
    throw invalid("Run exactly one read-only SELECT statement at a time.");
  }

  const state = { referencesData: false };
  validateStatement(statements[0], new Set<string>(), state);
  if (!state.referencesData) {
    throw invalid("The query must read from the current source relation named data.");
  }
  inspectExpressions(statements[0]);
  return { sql, referencesData: true };
}

function validateStatement(
  candidate: unknown,
  inheritedRelations: Set<string>,
  state: { referencesData: boolean },
): void {
  if (!isRecord(candidate) || typeof candidate.type !== "string" ||
      !selectableTypes.has(candidate.type)) {
    throw invalid("Only read-only SELECT and WITH ... SELECT queries are supported.");
  }

  if (candidate.type === "union" || candidate.type === "union all") {
    validateStatement(candidate.left, inheritedRelations, state);
    validateStatement(candidate.right, inheritedRelations, state);
    return;
  }

  if (candidate.type === "with") {
    const relations = new Set(inheritedRelations);
    const bindings = Array.isArray(candidate.bind) ? candidate.bind : [];
    for (const binding of bindings) {
      if (!isRecord(binding) || !isRecord(binding.alias) ||
          typeof binding.alias.name !== "string") {
        throw invalid("The WITH clause contains an unsupported binding.");
      }
      validateStatement(binding.statement, relations, state);
      relations.add(binding.alias.name.toLowerCase());
    }
    validateStatement(candidate.in, relations, state);
    return;
  }

	for (const key of Object.keys(candidate)) {
		if (!allowedSelectKeys.has(key)) {
			throw invalid(`SELECT feature '${key}' is not available in the SQL workspace.`);
		}
	}

  const from = Array.isArray(candidate.from) ? candidate.from : [];
  for (const item of from) validateFrom(item, inheritedRelations, state);
  inspectNestedStatements(candidate, inheritedRelations, state, new Set(["from"]));
}

function validateFrom(
  candidate: unknown,
  relations: Set<string>,
  state: { referencesData: boolean },
): void {
  if (!isRecord(candidate) || typeof candidate.type !== "string") {
    throw invalid("The FROM clause contains an unsupported source.");
  }
  if (candidate.type === "call") {
    throw invalid("Table functions and external readers are not available in the SQL workspace.");
  }
  if (candidate.type === "statement") {
    validateStatement(candidate.statement, relations, state);
    return;
  }
  if (candidate.type !== "table" || !isRecord(candidate.name) ||
      typeof candidate.name.name !== "string") {
    throw invalid("The FROM clause contains an unsupported source.");
  }
  if (candidate.name.schema || candidate.name.catalog) {
    throw invalid("Schema-qualified and catalog-qualified relations are not available.");
  }
  const relation = candidate.name.name.toLowerCase();
  if (relation === "data") {
    state.referencesData = true;
    return;
  }
  if (!relations.has(relation)) {
    throw invalid(`Relation '${candidate.name.name}' is outside the current data scope.`);
  }
}

function inspectNestedStatements(
  candidate: unknown,
  relations: Set<string>,
  state: { referencesData: boolean },
  omittedKeys = new Set<string>(),
): void {
  if (Array.isArray(candidate)) {
    candidate.forEach((value) => inspectNestedStatements(value, relations, state));
    return;
  }
  if (!isRecord(candidate)) return;
  for (const [key, value] of Object.entries(candidate)) {
    if (omittedKeys.has(key)) continue;
    if (isRecord(value) && typeof value.type === "string" && selectableTypes.has(value.type)) {
      validateStatement(value, relations, state);
    } else {
      inspectNestedStatements(value, relations, state);
    }
  }
}

function inspectExpressions(candidate: unknown): void {
  if (Array.isArray(candidate)) {
    candidate.forEach(inspectExpressions);
    return;
  }
  if (!isRecord(candidate)) return;
	if (typeof candidate.type === "string" && !allowedASTNodeTypes.has(candidate.type)) {
		throw invalid(`SQL feature '${candidate.type}' is not available in the SQL workspace.`);
	}
	if (candidate.type === "call") {
		if (!isRecord(candidate.function) || typeof candidate.function.name !== "string" ||
			candidate.function.schema || candidate.function.catalog) {
			throw invalid("Schema-qualified and unknown functions are not available in the SQL workspace.");
		}
		const functionName = candidate.function.name.toLowerCase();
		if (!allowedFunctions.has(functionName)) {
			throw invalid(`Function '${candidate.function.name}' is not available in the SQL workspace.`);
		}
  }
  Object.values(candidate).forEach(inspectExpressions);
}

function invalid(message: string, caught?: unknown): StructuredReaderError {
  return new StructuredReaderError("query", message, {
    detail: caught instanceof Error ? caught.message : caught === undefined ? undefined : String(caught),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
