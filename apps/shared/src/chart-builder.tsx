export const DEFAULT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea'];

export const DEFAULT_THEME = {
	background: '#ffffff',
	foreground: '#000000',
	mutedForeground: '#6b7280',
	border: '#e5e7eb',
};

export interface PlotlySeries {
	data_key: string;
	label?: string;
	color?: string;
}

export interface PlotlyFigureProps {
	data: Record<string, unknown>[];
	chartType: string;
	xAxisKey: string;
	xAxisType: 'number' | 'category';
	series: PlotlySeries[];
	title: string;
	resolvedColors?: string[];
	themeColors?: typeof DEFAULT_THEME;
}

export interface PlotlyFigureSpec {
	data: Record<string, unknown>[];
	layout: Record<string, unknown>;
}

export function buildPlotlyFigure(props: PlotlyFigureProps): PlotlyFigureSpec {
	const colors = props.resolvedColors ?? DEFAULT_COLORS;
	const theme = props.themeColors ?? DEFAULT_THEME;
	const x = props.data.map((row) => row[props.xAxisKey]);
	const traces = buildTraces(props, x, colors);
	const layout = buildLayout(props, theme);
	return { data: traces, layout };
}

export function labelize(key: unknown): string {
	const str = String(key);
	if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
		const date = new Date(str);
		if (!isNaN(date.getTime())) {
			return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
		}
	}
	return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function defaultColorFor(_key: string, index: number): string {
	return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export interface BuildChartProps {
	data: Record<string, unknown>[];
	chartType: string;
	xAxisKey: string;
	xAxisType?: 'number' | 'category';
	series: { data_key: string; label?: string; color?: string }[];
	colorFor?: (key: string, index: number) => string;
	labelFormatter?: (value: string) => string;
	showGrid?: boolean;
	children?: unknown[];
	margin?: { top?: number; right?: number; bottom?: number; left?: number };
	title?: string;
}

/** Use buildPlotlyFigure for plotly figure specs instead. */
export function buildChart(_props: BuildChartProps): never {
	throw new Error('buildChart is not available: charts use the Plotly Python sandbox.');
}

function resolveColor(raw: string | undefined, index: number, colors: string[]): string {
	if (!raw) {
		return colors[index % colors.length];
	}
	const varMatch = raw.match(/^var\(--chart-(\d+)\)$/);
	if (varMatch) {
		const idx = parseInt(varMatch[1], 10) - 1;
		return colors[idx] ?? colors[0];
	}
	return raw;
}

function toNumeric(v: unknown): number {
	return typeof v === 'number' ? v : Number(v) || 0;
}

function buildTraces(
	{ chartType, data, series }: PlotlyFigureProps,
	x: unknown[],
	colors: string[],
): Record<string, unknown>[] {
	const type = chartType.toLowerCase();

	if (type === 'pie' || type === 'donut') {
		const s = series[0];
		if (!s) {
			return [];
		}
		return [
			{
				type: 'pie',
				labels: x,
				values: data.map((row) => toNumeric(row[s.data_key])),
				hole: type === 'donut' ? 0.4 : 0,
				marker: { colors: data.map((_, i) => colors[i % colors.length]) },
				textinfo: 'label+percent',
			},
		];
	}

	if (type === 'heatmap') {
		const s = series[0];
		if (!s) {
			return [];
		}
		const yKeys = series.map((si) => si.data_key);
		const z = yKeys.map((key) => data.map((row) => toNumeric(row[key])));
		return [
			{
				type: 'heatmap',
				x,
				y: yKeys.map((k) => series.find((si) => si.data_key === k)?.label ?? k),
				z,
				colorscale: 'Viridis',
			},
		];
	}

	if (type === 'histogram') {
		return series.map((s, i) => ({
			type: 'histogram',
			x: data.map((row) => row[s.data_key]),
			name: s.label ?? s.data_key,
			marker: { color: resolveColor(s.color, i, colors) },
		}));
	}

	return series.map((s, i) => {
		const color = resolveColor(s.color, i, colors);
		const y = data.map((row) => toNumeric(row[s.data_key]));
		const base = { x, y, name: s.label ?? s.data_key };

		switch (type) {
			case 'bar':
			case 'column':
			case 'grouped_column':
			case 'stacked_bar':
				return { ...base, type: 'bar', marker: { color } };

			case 'horizontal_bar':
				return { ...base, type: 'bar', orientation: 'h', x: y, y: x, marker: { color } };

			case 'line':
				return { ...base, type: 'scatter', mode: 'lines', line: { color } };

			case 'area':
				return {
					...base,
					type: 'scatter',
					mode: 'lines',
					fill: 'tozeroy',
					line: { color },
					fillcolor: color + '33',
				};

			case 'scatter':
				return { ...base, type: 'scatter', mode: 'markers', marker: { color } };

			default:
				return { ...base, type, marker: { color } };
		}
	});
}

function buildLayout(
	{ chartType, xAxisType, title, series }: PlotlyFigureProps,
	theme: typeof DEFAULT_THEME,
): Record<string, unknown> {
	const type = chartType.toLowerCase();
	const isPie = type === 'pie' || type === 'donut';

	const base: Record<string, unknown> = {
		paper_bgcolor: 'transparent',
		plot_bgcolor: theme.background,
		font: { color: theme.foreground, size: 12 },
		margin: { t: title ? 40 : 20, r: 20, b: 60, l: 60 },
		autosize: true,
		title: title ? { text: title, font: { size: 14, color: theme.foreground } } : undefined,
		showlegend: series.length > 1 || isPie,
		legend: { orientation: 'h', y: -0.15, yanchor: 'top', x: 0.5, xanchor: 'center' },
	};

	if (isPie) {
		return base;
	}

	const axisBase = {
		showgrid: true,
		gridcolor: theme.border,
		tickfont: { color: theme.mutedForeground },
		zeroline: false,
	};

	return {
		...base,
		barmode:
			type === 'stacked_bar'
				? 'stack'
				: type === 'bar' || type === 'column' || type === 'grouped_column' || type === 'horizontal_bar'
					? 'group'
					: undefined,
		xaxis: {
			...axisBase,
			type: xAxisType === 'number' ? 'linear' : '-',
			automargin: true,
			tickangle: -45,
		},
		yaxis: { ...axisBase, autorange: true, rangemode: 'normal', automargin: true },
	};
}
