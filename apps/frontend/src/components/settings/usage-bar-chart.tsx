import { useMemo } from 'react';
import Plot from 'react-plotly.js';
import type { Data, Datum, Layout } from 'plotly.js';
import { useTheme } from '@/contexts/theme.provider';

const CHART_CSS_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

function getResolvedColors(): string[] {
	if (typeof document === 'undefined') {
		return ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
	}
	const styles = getComputedStyle(document.documentElement);
	return CHART_CSS_VARS.map((v) => styles.getPropertyValue(v).trim() || '#6366f1');
}

function getThemeColors(): Record<string, string> {
	if (typeof document === 'undefined') {
		return { background: '#ffffff', foreground: '#000000', mutedForeground: '#6b7280', border: '#e5e7eb' };
	}
	const styles = getComputedStyle(document.documentElement);
	return {
		background: styles.getPropertyValue('--background').trim() || 'transparent',
		foreground: styles.getPropertyValue('--foreground').trim() || '#000000',
		mutedForeground: styles.getPropertyValue('--muted-foreground').trim() || '#6b7280',
		border: styles.getPropertyValue('--border').trim() || '#e5e7eb',
	};
}

export interface UsageBarChartProps {
	data: Record<string, unknown>[];
	chartType: 'bar' | 'stacked_bar';
	xAxisKey: string;
	series: { data_key: string; color: string; label: string }[];
	xAxisLabelFormatter?: (value: string) => string;
	showGrid?: boolean;
}

export function UsageBarChart({
	data,
	chartType,
	xAxisKey,
	series,
	xAxisLabelFormatter,
	showGrid = true,
}: UsageBarChartProps) {
	const { theme } = useTheme();
	const resolvedColors = useMemo(() => getResolvedColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
	const themeColors = useMemo(() => getThemeColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

	const { plotData, layout } = useMemo(() => {
		const x = data.map((row) => row[xAxisKey] as Datum);
		const traces: Data[] = series.map((s, i) => ({
			type: 'bar' as const,
			x: xAxisLabelFormatter ? x.map((v) => xAxisLabelFormatter(String(v))) : x,
			y: data.map((row) => {
				const v = row[s.data_key];
				return typeof v === 'number' ? v : Number(v) || 0;
			}),
			name: s.label,
			marker: { color: s.color || resolvedColors[i % resolvedColors.length] },
		}));

		const baseLayout: Partial<Layout> = {
			paper_bgcolor: 'transparent',
			plot_bgcolor: themeColors.background,
			font: { color: themeColors.foreground, size: 12 },
			margin: { t: 20, r: 20, b: 40, l: 50 },
			autosize: true,
			barmode: chartType === 'stacked_bar' ? 'stack' : 'group',
			showlegend: true,
			legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0.5, xanchor: 'center' },
			xaxis: {
				showgrid: showGrid,
				gridcolor: themeColors.border,
				tickfont: { color: themeColors.mutedForeground },
				zeroline: false,
			},
			yaxis: {
				showgrid: showGrid,
				gridcolor: themeColors.border,
				tickfont: { color: themeColors.mutedForeground },
				zeroline: false,
				autorange: true,
				rangemode: 'normal',
			},
		};

		return { plotData: traces, layout: baseLayout };
	}, [data, chartType, xAxisKey, series, xAxisLabelFormatter, showGrid, resolvedColors, themeColors]);

	if (plotData.length === 0) {
		return (
			<div className='flex h-full min-h-[200px] items-center justify-center rounded border border-dashed text-sm text-muted-foreground'>
				No data to display.
			</div>
		);
	}

	return (
		<div className='w-full aspect-video min-h-[200px]'>
			<Plot
				data={plotData}
				layout={layout}
				config={{ responsive: true, displayModeBar: false }}
				style={{ width: '100%', height: '100%' }}
				useResizeHandler
			/>
		</div>
	);
}
