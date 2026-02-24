import z from 'zod/v3';

export const ChartTypeEnum = z.enum([
	'bar',
	'stacked_bar',
	'line',
	'pie',
	'scatter',
	'radar',
	'radial_bar',
	// Basic charts
	'bubble',
	'horizontal_bar',
	'funnel',
	'funnelarea',
	'table',
	'filled_area',
	// Financial charts
	'candlestick',
	'ohlc',
	'waterfall',
	'indicator',
	'gauge',
]);

export const XAxisTypeEnum = z.enum(['date', 'number', 'category']);

export const SeriesConfigSchema = z.object({
	data_key: z.string().describe('Column name from SQL result to plot.'),
	color: z.string().describe('CSS color (defaults to theme colors).'),
	label: z.string().describe('Label to display in the legend.').optional(),
	size_key: z
		.string()
		.optional()
		.describe('Column for bubble size. Only used when chart_type is bubble.'),
});

export const OhlcKeysSchema = z.object({
	open: z.string().describe('Column name for open price.'),
	high: z.string().describe('Column name for high price.'),
	low: z.string().describe('Column name for low price.'),
	close: z.string().describe('Column name for close price.'),
});

export const ChartTypeCombinedEnum = z.enum([
	'bar',
	'stacked_bar',
	'line',
	'filled_area',
	'scatter',
	'candlestick',
	'ohlc',
]);

export const ChartConfigSchema = z.object({
	chart_type: ChartTypeEnum.describe('Type of chart to display.'),
	x_axis_key: z.string().describe('Column name for X-axis/category labels.'),
	x_axis_type: XAxisTypeEnum.nullable().optional().describe(
		'Use "date" only when x-axis values parse as JS Date (YYYY-MM-DD). Use "category" for quarter_ending, fiscal periods, or labels. Use "number" for numeric x-axis.',
	),
	series: z
		.array(SeriesConfigSchema)
		.describe('Columns to plot as data series. Required for most charts; omit for candlestick/ohlc (use ohlc_keys instead).'),
	ohlc_keys: OhlcKeysSchema.optional().describe(
		'Required for candlestick and ohlc charts. Maps column names for open, high, low, close prices.',
	),
	measure_key: z.string().optional().describe('For waterfall charts: column with "relative", "total", or "absolute" per row.'),
	label_key: z.string().optional().describe('Column name for point labels. Defaults to x_axis_key when omitted.'),
	title: z.string().optional().describe('Subplot title.'),
}).superRefine((data, ctx) => {
	const ohlcCharts = ['candlestick', 'ohlc'];
	if (ohlcCharts.includes(data.chart_type) && data.ohlc_keys) {
		return;
	}
	if (!data.series || data.series.length < 1) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one series is required for this chart type.' });
	}
});

export const LayerConfigSchema = z.object({
	chart_type: ChartTypeCombinedEnum.describe('Type of trace for this layer.'),
	series: z.array(SeriesConfigSchema).describe('Columns to plot for this layer.'),
	y_axis: z.enum(['y', 'y2']).optional().describe('Which y-axis to use. Default "y". Use "y2" for secondary (right) axis.'),
});

export const GridSchema = z.object({
	rows: z.number().int().positive().optional().describe('Number of grid rows for subplots.'),
	columns: z.number().int().positive().optional().describe('Number of grid columns for subplots.'),
});

export const LayoutModeEnum = z.enum(['single', 'subplots', 'combined']);

export const InputSchema = z
	.object({
		query_id: z.string().describe("The id of a previous `execute_sql` tool call's output to get data from."),
		layout_mode: LayoutModeEnum.optional().describe(
			'Layout mode. Default: "single" when chart_type/series at top level; "subplots" when charts present; "combined" when layers present.',
		),
		chart_type: ChartTypeEnum.optional().describe('Type of chart for single mode.'),
		x_axis_key: z.string().optional().describe('Column name for X-axis. Required for single and combined modes.'),
		x_axis_type: XAxisTypeEnum.nullable().optional().describe(
			'Use "date" only when x-axis values parse as JS Date (YYYY-MM-DD). Use "category" for quarter_ending, fiscal periods, or labels. Use "number" for numeric x-axis.',
		),
		series: z
			.array(SeriesConfigSchema)
			.optional()
			.describe('Columns to plot as data series. Required for single mode; omit for candlestick/ohlc (use ohlc_keys instead).'),
		ohlc_keys: OhlcKeysSchema.optional().describe(
			'Required for candlestick and ohlc charts. Maps column names for open, high, low, close prices.',
		),
		measure_key: z
			.string()
			.optional()
			.describe(
				'For waterfall charts: column with "relative", "total", or "absolute" per row. First row typically "absolute", last "total", others "relative".',
			),
		label_key: z
			.string()
			.optional()
			.describe(
				'Column name for point labels (e.g. company name). Used for scatter point labels and tooltip header. Defaults to x_axis_key when omitted.',
			),
		title: z
			.string()
			.optional()
			.describe(
				'A concise and descriptive title of what the chart shows. Do not include the type of chart in the title or other chart configurations.',
			),
		column_labels: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				'Optional mapping of data_key to display label. Use when pivoted columns have generic names (s1, s2) but you know the actual entity names from a previous query.',
			),
		charts: z.array(ChartConfigSchema).optional().describe('For subplots: each element is one subplot.'),
		layers: z.array(LayerConfigSchema).optional().describe('For combined: each element is one trace type (bar, line, etc.) on shared axes.'),
		grid: GridSchema.optional().describe('For subplots: grid shape. Auto-derived from charts.length if omitted.'),
	})
	.superRefine((data, ctx) => {
		const hasCharts = data.charts && data.charts.length > 0;
		const hasLayers = data.layers && data.layers.length > 0;

		if (hasCharts && hasLayers) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cannot use both charts and layers at the same time.' });
			return;
		}

		if (hasCharts) {
			if (data.chart_type) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Do not use chart_type at top level when using charts (subplots).' });
			}
			if (data.grid) {
				const rows = data.grid.rows ?? 1;
				const cols = data.grid.columns ?? 1;
				if (rows * cols < data.charts!.length) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Grid rows*columns (${rows}*${cols}) must be >= charts.length (${data.charts!.length}).` });
				}
			}
			return;
		}

		if (hasLayers) {
			if (!data.x_axis_key) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'x_axis_key is required for combined charts.' });
			}
			if (data.chart_type) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Do not use chart_type at top level when using layers (combined).' });
			}
			return;
		}

		// Single mode
		if (!data.chart_type) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'chart_type is required for single chart mode.' });
		}
		if (!data.x_axis_key) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'x_axis_key is required.' });
		}
		const ohlcCharts = ['candlestick', 'ohlc'];
		if (ohlcCharts.includes(data.chart_type!) && data.ohlc_keys) {
			return;
		}
		if (!data.series || data.series.length < 1) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one series is required for this chart type.' });
		}
	});

export const OutputSchema = z.object({
	_version: z.literal('1').optional(),
	success: z.boolean(),
	error: z.string().optional(),
});

export type ChartType = z.infer<typeof ChartTypeEnum>;
export type ChartTypeCombined = z.infer<typeof ChartTypeCombinedEnum>;
export type XAxisType = z.infer<typeof XAxisTypeEnum>;
export type SeriesConfig = z.infer<typeof SeriesConfigSchema>;
export type ChartConfig = z.infer<typeof ChartConfigSchema>;
export type LayerConfig = z.infer<typeof LayerConfigSchema>;
export type GridConfig = z.infer<typeof GridSchema>;
export type LayoutMode = z.infer<typeof LayoutModeEnum>;
export type Input = z.infer<typeof InputSchema>;
export type Output = z.infer<typeof OutputSchema>;

export type NormalizedConfig =
	| { mode: 'single'; config: Input & { chart_type: ChartType; x_axis_key: string; series: SeriesConfig[] } }
	| { mode: 'subplots'; charts: ChartConfig[]; grid?: GridConfig; query_id: string; column_labels?: Record<string, string>; title?: string }
	| { mode: 'combined'; layers: LayerConfig[]; x_axis_key: string; x_axis_type?: XAxisType | null; query_id: string; column_labels?: Record<string, string>; title?: string };

function hasValidSeries(layer: { chart_type?: string; series?: unknown[]; ohlc_keys?: unknown }): boolean {
	const ohlcCharts = ['candlestick', 'ohlc'];
	if (ohlcCharts.includes(layer.chart_type ?? '') && layer.ohlc_keys) {
		return true;
	}
	return (layer.series?.length ?? 0) > 0;
}

export function normalizeConfig(raw: Input | null | undefined): NormalizedConfig | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const validCharts = raw.charts?.filter((c) => hasValidSeries(c)) ?? [];
	const validLayers = raw.layers?.filter((l) => (l.series?.length ?? 0) > 0) ?? [];
	const hasCharts = validCharts.length > 0;
	const hasLayers = validLayers.length > 0;

	if (hasCharts && validCharts.length > 0) {
		return {
			mode: 'subplots',
			charts: validCharts,
			grid: raw.grid,
			query_id: raw.query_id,
			column_labels: raw.column_labels,
			title: raw.title,
		};
	}

	if (hasLayers && validLayers.length > 0 && raw.x_axis_key) {
		return {
			mode: 'combined',
			layers: validLayers,
			x_axis_key: raw.x_axis_key,
			x_axis_type: raw.x_axis_type ?? undefined,
			query_id: raw.query_id,
			column_labels: raw.column_labels,
			title: raw.title,
		};
	}

	if (raw.chart_type && raw.x_axis_key) {
		const ohlcCharts = ['candlestick', 'ohlc'];
		const hasOhlc = ohlcCharts.includes(raw.chart_type) && raw.ohlc_keys;
		const hasSeries = (raw.series?.length ?? 0) > 0;
		if (hasOhlc || hasSeries) {
			return {
				mode: 'single',
				config: { ...raw, series: raw.series ?? [] } as Input & { chart_type: ChartType; x_axis_key: string; series: SeriesConfig[] },
			};
		}
	}

	return null;
}
