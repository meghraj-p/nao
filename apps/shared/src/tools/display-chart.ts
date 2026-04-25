import z from 'zod/v3';

export const InputSchema = z.object({
	query_id: z.string().describe("The id of a previous `execute_sql` tool call's output to get data from."),
	python_code: z
		.string()
		.describe(
			'Python code that creates a Plotly chart. The code runs in a sandbox with `df` (pandas DataFrame of SQL results), `pd`, `px` (plotly.express), `go` (plotly.graph_objects), `np`, `math`, and `datetime` pre-imported. Must assign the final figure to a variable named `fig`.',
		),
});

export const OutputSchema = z.object({
	success: z.boolean(),
	html: z.string().optional(),
	error: z.string().optional(),
	failed_code: z.string().optional(),
	computed_values: z.record(z.string(), z.string()).optional(),
});

export type Input = z.infer<typeof InputSchema>;
export type Output = z.infer<typeof OutputSchema>;

/** Stub types retained for upstream Stories compatibility. Charts use Plotly Python sandbox. */
export type ChartType = string;
export type XAxisType = string;
