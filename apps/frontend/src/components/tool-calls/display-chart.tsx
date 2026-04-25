import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import { Skeleton } from '../ui/skeleton';
import { TextShimmer } from '../ui/text-shimmer';
import { ToolCallWrapper } from './tool-call-wrapper';
import type { ToolCallComponentProps } from '.';
import type { Data, Datum, Layout } from 'plotly.js';
import { useTheme } from '@/contexts/theme.provider';

export const DisplayChartToolCall = ({ toolPart }: ToolCallComponentProps<'display_chart'>) => {
	const output = toolPart.output;
	const html = output?.html;

	if (output?.error) {
		return (
			<ToolCallWrapper defaultExpanded title='Could not display the chart'>
				<div className='p-4 text-red-400 text-sm whitespace-pre-wrap font-mono'>{output.error}</div>
			</ToolCallWrapper>
		);
	}

	if (!html) {
		return (
			<div className='my-4 flex flex-col gap-2 items-center aspect-3/2'>
				<Skeleton className='w-1/2 h-4' />
				<Skeleton className='w-full flex-1 flex items-center justify-center gap-2'>
					<TextShimmer text='Generating chart' />
				</Skeleton>
			</div>
		);
	}

	return <PlotlyIframe html={html} />;
};

export interface ChartDisplayProps {
	data: Record<string, unknown>[];
	chartType: string;
	xAxisKey: string;
	xAxisType: 'number' | 'category';
	series: Array<{ data_key: string; color: string; label?: string }>;
	title: string;
}

export function ChartDisplay({ data, chartType, xAxisKey, xAxisType, series, title }: ChartDisplayProps) {
	const { theme } = useTheme();
	const resolvedColors = useMemo(() => getResolvedColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
	const themeColors = useMemo(() => getThemeColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

	const { plotData, layout } = useMemo(
		() => buildPlotConfig({ data, chartType, xAxisKey, xAxisType, series, title, resolvedColors, themeColors }),
		[data, chartType, xAxisKey, xAxisType, series, title, resolvedColors, themeColors],
	);

	if (plotData.length === 0) {
		return (
			<div className='flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground'>
				No data to display
			</div>
		);
	}

	return (
		<Plot
			data={plotData}
			layout={layout}
			config={{ responsive: true, displayModeBar: false }}
			style={{ width: '100%', height: '100%' }}
			useResizeHandler
		/>
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHART_CSS_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

/** Converts any CSS color (including oklch) to a hex string Plotly can understand. */
function cssColorToHex(value: string): string {
	const ctx = document.createElement('canvas').getContext('2d');
	if (!ctx) {
		return value;
	}
	ctx.fillStyle = value;
	return ctx.fillStyle;
}

function getCssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
	const raw = styles.getPropertyValue(name).trim();
	return raw ? cssColorToHex(raw) : fallback;
}

function getResolvedColors(): string[] {
	if (typeof document === 'undefined') {
		return ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
	}
	const styles = getComputedStyle(document.documentElement);
	return CHART_CSS_VARS.map((v) => getCssVar(styles, v, '#6366f1'));
}

function getThemeColors() {
	if (typeof document === 'undefined') {
		return { background: '#ffffff', foreground: '#000000', mutedForeground: '#6b7280', border: '#e5e7eb' };
	}
	const styles = getComputedStyle(document.documentElement);
	return {
		background: getCssVar(styles, '--background', 'transparent'),
		foreground: getCssVar(styles, '--foreground', '#000000'),
		mutedForeground: getCssVar(styles, '--muted-foreground', '#6b7280'),
		border: getCssVar(styles, '--border', '#e5e7eb'),
	};
}

function resolveColor(raw: string | undefined, index: number, resolvedColors: string[]): string {
	if (!raw) {
		return resolvedColors[index % resolvedColors.length];
	}
	const varMatch = raw.match(/^var\(--chart-(\d+)\)$/);
	if (varMatch) {
		const idx = parseInt(varMatch[1], 10) - 1;
		return resolvedColors[idx] ?? resolvedColors[0];
	}
	return raw;
}

function toNumeric(v: unknown): number {
	return typeof v === 'number' ? v : Number(v) || 0;
}

function buildPlotConfig({
	data,
	chartType,
	xAxisKey,
	xAxisType,
	series,
	title,
	resolvedColors,
	themeColors,
}: ChartDisplayProps & { resolvedColors: string[]; themeColors: ReturnType<typeof getThemeColors> }): {
	plotData: Data[];
	layout: Partial<Layout>;
} {
	const x = data.map((row) => row[xAxisKey] as Datum);
	const traces = buildTraces({ chartType, data, x, series, resolvedColors });

	const layout = buildLayout({ chartType, xAxisType, title, series, themeColors });

	return { plotData: traces, layout };
}

function buildTraces({
	chartType,
	data,
	x,
	series,
	resolvedColors,
}: {
	chartType: string;
	data: Record<string, unknown>[];
	x: Datum[];
	series: ChartDisplayProps['series'];
	resolvedColors: string[];
}): Data[] {
	const type = chartType.toLowerCase();

	if (type === 'pie' || type === 'donut') {
		const s = series[0];
		if (!s) {
			return [];
		}
		return [
			{
				type: 'pie' as const,
				labels: x,
				values: data.map((row) => toNumeric(row[s.data_key])),
				hole: type === 'donut' ? 0.4 : 0,
				marker: { colors: data.map((_, i) => resolvedColors[i % resolvedColors.length]) },
				textinfo: 'label+percent',
			} as Data,
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
				type: 'heatmap' as const,
				x,
				y: yKeys.map((k) => series.find((si) => si.data_key === k)?.label ?? k),
				z,
				colorscale: 'Viridis',
			} as Data,
		];
	}

	if (type === 'histogram') {
		return series.map((s, i) => ({
			type: 'histogram' as const,
			x: data.map((row) => row[s.data_key] as Datum),
			name: s.label ?? s.data_key,
			marker: { color: resolveColor(s.color, i, resolvedColors) },
		})) as Data[];
	}

	return series.map((s, i) => {
		const color = resolveColor(s.color, i, resolvedColors);
		const y = data.map((row) => toNumeric(row[s.data_key]));
		const base = { x, y, name: s.label ?? s.data_key };

		switch (type) {
			case 'bar':
			case 'column':
			case 'grouped_column':
			case 'stacked_bar':
				return { ...base, type: 'bar' as const, marker: { color } } as Data;

			case 'horizontal_bar':
				return {
					...base,
					type: 'bar' as const,
					orientation: 'h' as const,
					x: y,
					y: x,
					marker: { color },
				} as Data;

			case 'line':
				return { ...base, type: 'scatter' as const, mode: 'lines' as const, line: { color } } as Data;

			case 'area':
				return {
					...base,
					type: 'scatter' as const,
					mode: 'lines' as const,
					fill: 'tozeroy' as const,
					line: { color },
					fillcolor: color + '33',
				} as Data;

			case 'scatter':
				return { ...base, type: 'scatter' as const, mode: 'markers' as const, marker: { color } } as Data;

			default:
				return { ...base, type: type as Data['type'], marker: { color } } as Data;
		}
	});
}

function buildLayout({
	chartType,
	xAxisType,
	title,
	series,
	themeColors,
}: {
	chartType: string;
	xAxisType: string;
	title: string;
	series: ChartDisplayProps['series'];
	themeColors: ReturnType<typeof getThemeColors>;
}): Partial<Layout> {
	const type = chartType.toLowerCase();
	const isPie = type === 'pie' || type === 'donut';

	const base: Partial<Layout> = {
		paper_bgcolor: 'transparent',
		plot_bgcolor: themeColors.background,
		font: { color: themeColors.foreground, size: 12 },
		margin: { t: title ? 40 : 20, r: 20, b: 60, l: 60 },
		autosize: true,
		title: title ? { text: title, font: { size: 14, color: themeColors.foreground } } : undefined,
		showlegend: series.length > 1 || isPie,
		legend: { orientation: 'h', y: -0.15, yanchor: 'top', x: 0.5, xanchor: 'center' },
	};

	if (isPie) {
		return base;
	}

	const axisBase = {
		showgrid: true,
		gridcolor: themeColors.border,
		tickfont: { color: themeColors.mutedForeground },
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
			type: xAxisType === 'number' ? ('linear' as const) : ('-' as const),
			automargin: true,
			tickangle: -45,
		},
		yaxis: { ...axisBase, autorange: true, rangemode: 'normal', automargin: true },
	};
}

function PlotlyIframe({ html }: { html: string }) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(450);

	const syncHeight = useCallback(() => {
		const doc = iframeRef.current?.contentDocument;
		if (!doc?.body) {
			return;
		}

		const contentHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
		if (contentHeight > 0) {
			setHeight(contentHeight);
		}
	}, []);

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) {
			return;
		}

		let observer: ResizeObserver | undefined;

		const handleLoad = () => {
			syncHeight();
			observer = new ResizeObserver(syncHeight);
			if (iframe.contentDocument?.body) {
				observer.observe(iframe.contentDocument.body);
			}
		};

		iframe.addEventListener('load', handleLoad);
		return () => {
			iframe.removeEventListener('load', handleLoad);
			observer?.disconnect();
		};
	}, [syncHeight]);

	const wrappedHtml = `<!DOCTYPE html>
<html><head>
<style>body{margin:0;padding:0;overflow:hidden;background:transparent;}</style>
</head><body>${html}</body></html>`;

	return (
		<div className='my-4 w-full border border-border'>
			<iframe
				ref={iframeRef}
				srcDoc={wrappedHtml}
				sandbox='allow-scripts'
				style={{ width: '100%', height: `${height}px`, border: 'none' }}
				title='Chart'
			/>
		</div>
	);
}
