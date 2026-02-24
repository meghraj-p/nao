import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { displayChart } from '@nao/shared/tools';
import { useAgentContext } from '../../contexts/agent.provider';
import { Skeleton } from '../ui/skeleton';
import { TextShimmer } from '../ui/text-shimmer';
import { ChartRangeSelector } from './display-chart-range-selector';
import { ToolCallWrapper } from './tool-call-wrapper';
import type { Data, Datum, Layout } from 'plotly.js';
import type { ToolCallComponentProps } from '.';
import type { DateRange } from '@/lib/charts.utils';
import { useTheme } from '@/contexts/theme.provider';
import { DATE_RANGE_OPTIONS, filterByDateRange, labelize } from '@/lib/charts.utils';
import { getToolName, isToolUIPart } from '@/lib/ai';
import type { UIMessage } from '@nao/backend/chat';

const CHART_CSS_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;
const MAX_X_TICKS = 12;

function sampleTicks<T>(arr: T[], maxTicks: number = MAX_X_TICKS): T[] {
	if (arr.length <= maxTicks) {
		return arr;
	}
	const step = Math.ceil(arr.length / maxTicks);
	return [...Array(maxTicks)].map((_, i) => arr[Math.min(i * step, arr.length - 1)]);
}

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

function getSeriesLabel(s: displayChart.SeriesConfig, columnLabels?: Record<string, string>): string {
	return columnLabels?.[s.data_key] ?? s.label ?? labelize(s.data_key);
}

function findExecuteSqlOutput(
	part: UIMessage['parts'][number],
	queryId: string,
): { data: Record<string, unknown>[]; columns?: string[]; id: string } | null {
	if (isToolUIPart(part) && getToolName(part) === 'execute_sql' && part.output) {
		const out = part.output as { id?: string; data?: Record<string, unknown>[] };
		if (out.id === queryId && Array.isArray(out.data)) {
			return out as { data: Record<string, unknown>[]; columns?: string[]; id: string };
		}
	}
	return null;
}

function getAvailableColumns(sourceData: { data: Record<string, unknown>[]; columns?: string[] }): Set<string> {
	const data = sourceData.data;
	return new Set(sourceData.columns?.length ? sourceData.columns : Object.keys(data[0] ?? {}));
}

function getNumericColumns(
	sourceData: { data: Record<string, unknown>[]; columns?: string[] },
	exclude: string,
): string[] {
	const cols = sourceData.columns?.length
		? sourceData.columns
		: Object.keys(sourceData.data[0] ?? {});
	const firstRow = sourceData.data[0];
	if (!firstRow) return [];
	return cols.filter((c) => c !== exclude && typeof (firstRow[c] ?? 0) === 'number');
}

/** Infers a single-chart config from partial config + data when series is missing. */
function tryInferConfig(
	config: displayChart.Input,
	sourceData: { data: Record<string, unknown>[]; columns?: string[] } | null,
): displayChart.NormalizedConfig | null {
	if (!config?.query_id || !config.x_axis_key || !sourceData?.data?.length) return null;
	if (displayChart.normalizeConfig(config)) return null;

	const chartType =
		config.chart_type ??
		(config.layers?.[0] as { chart_type?: string } | undefined)?.chart_type ??
		'line';
	const ohlcCharts = ['candlestick', 'ohlc'];
	if (ohlcCharts.includes(chartType) && config.ohlc_keys) return null;

	const numericCols = getNumericColumns(sourceData, config.x_axis_key);
	if (numericCols.length === 0) return null;

	const preferredOrder = ['close', 'value', 'amount', 'open', 'high', 'low'];
	const sorted = [...numericCols].sort((a, b) => {
		const ia = preferredOrder.indexOf(a);
		const ib = preferredOrder.indexOf(b);
		if (ia >= 0 && ib >= 0) return ia - ib;
		if (ia >= 0) return -1;
		if (ib >= 0) return 1;
		return 0;
	});
	const series: displayChart.SeriesConfig[] = sorted.map((data_key) => ({
		data_key,
		color: '',
		label: labelize(data_key),
	}));

	return {
		mode: 'single',
		config: {
			...config,
			chart_type: chartType as displayChart.ChartType,
			x_axis_key: config.x_axis_key,
			series,
		} as displayChart.Input & {
			chart_type: displayChart.ChartType;
			x_axis_key: string;
			series: displayChart.SeriesConfig[];
		},
	};
}

function validateChartConfig(
	chart: {
		x_axis_key: string;
		chart_type: string;
		series: displayChart.SeriesConfig[];
		ohlc_keys?: { open: string; high: string; low: string; close: string };
		measure_key?: string;
		label_key?: string;
	},
	availableColumns: Set<string>,
	columnsList: string,
): string | null {
	const missing = (col: string) => !availableColumns.has(col);
	if (missing(chart.x_axis_key)) {
		return `Column "${chart.x_axis_key}" (x_axis_key) not found. Available columns: ${columnsList}`;
	}
	const ohlcCharts = ['candlestick', 'ohlc'];
	if (ohlcCharts.includes(chart.chart_type) && chart.ohlc_keys) {
		const ohlcCols = [chart.ohlc_keys.open, chart.ohlc_keys.high, chart.ohlc_keys.low, chart.ohlc_keys.close];
		const missingOhlc = ohlcCols.filter(missing);
		if (missingOhlc.length > 0) {
			return `OHLC columns not found: ${missingOhlc.join(', ')}. Available columns: ${columnsList}`;
		}
		return null;
	}
	for (const s of chart.series) {
		if (missing(s.data_key)) {
			return `Column "${s.data_key}" (series) not found. Available columns: ${columnsList}`;
		}
		if (s.size_key && missing(s.size_key)) {
			return `Column "${s.size_key}" (size_key for bubble) not found. Available columns: ${columnsList}`;
		}
	}
	if (chart.measure_key && missing(chart.measure_key)) {
		return `Column "${chart.measure_key}" (measure_key) not found. Available columns: ${columnsList}`;
	}
	if (chart.label_key && missing(chart.label_key)) {
		return `Column "${chart.label_key}" (label_key) not found. Available columns: ${columnsList}`;
	}
	return null;
}

/** Validates that chart config columns exist in the data. Returns error message or null if valid. */
function validateChartData(
	config: displayChart.Input,
	sourceData: { data: Record<string, unknown>[]; columns?: string[] },
): string | null {
	if (!sourceData.data.length) {
		return null;
	}
	const availableColumns = getAvailableColumns(sourceData);
	const columnsList = [...availableColumns].sort().join(', ');

	const norm = displayChart.normalizeConfig(config);
	if (!norm) {
		return 'Invalid chart configuration.';
	}

	if (norm.mode === 'subplots') {
		for (let i = 0; i < norm.charts.length; i++) {
			const err = validateChartConfig(norm.charts[i], availableColumns, columnsList);
			if (err) {
				return `Subplot ${i + 1}: ${err}`;
			}
		}
		return null;
	}
	if (norm.mode === 'combined') {
		for (let i = 0; i < norm.layers.length; i++) {
			const layer = norm.layers[i];
			const err = validateChartConfig(
				{ x_axis_key: norm.x_axis_key, chart_type: layer.chart_type, series: layer.series },
				availableColumns,
				columnsList,
			);
			if (err) {
				return `Layer ${i + 1}: ${err}`;
			}
		}
		return null;
	}
	return validateChartConfig(
		{
			x_axis_key: norm.config.x_axis_key,
			chart_type: norm.config.chart_type,
			series: norm.config.series,
			ohlc_keys: norm.config.ohlc_keys,
			measure_key: norm.config.measure_key,
			label_key: norm.config.label_key,
		},
		availableColumns,
		columnsList,
	);
}

function resolveColor(color: string, index: number, resolvedColors: string[]): string {
	if (color && color.startsWith('var(--chart-')) {
		const match = color.match(/var\(--chart-(\d)\)/);
		if (match) {
			const idx = parseInt(match[1], 10) - 1;
			return resolvedColors[idx] ?? resolvedColors[index % resolvedColors.length];
		}
	}
	if (color && color.startsWith('var(')) {
		if (typeof document === 'undefined') {
			return resolvedColors[index % resolvedColors.length];
		}
		const varName = color.replace(/var\(([^)]+)\)/, '$1').trim();
		return (
			getComputedStyle(document.documentElement).getPropertyValue(varName).trim() ||
			resolvedColors[index % resolvedColors.length]
		);
	}
	return color || resolvedColors[index % resolvedColors.length];
}

interface BuildTracesOptions {
	xAxisType: 'number' | 'category' | 'date';
	columnLabels?: Record<string, string>;
	ohlcKeys?: { open: string; high: string; low: string; close: string };
	measureKey?: string;
	labelKey?: string;
	resolvedColors: string[];
	themeColors: Record<string, string>;
	formatTick: (v: unknown) => string;
	showGrid?: boolean;
}

function buildTracesForChart(
	data: Record<string, unknown>[],
	chartType: displayChart.ChartType,
	xAxisKey: string,
	series: displayChart.SeriesConfig[],
	options: BuildTracesOptions,
): Data[] {
	const { columnLabels, ohlcKeys, measureKey, labelKey, resolvedColors, themeColors } = options;
	const traces: Data[] = [];

	if (chartType === 'horizontal_bar') {
		const y = data.map((row) => labelize(row[xAxisKey]));
		for (let i = 0; i < series.length; i++) {
			const s = series[i];
			const color = resolveColor(s.color ?? '', i, resolvedColors);
			const x = data.map((row) => {
				const v = row[s.data_key];
				return typeof v === 'number' ? v : Number(v) || 0;
			});
			traces.push({
				type: 'bar',
				x: x as Datum[],
				y,
				orientation: 'h',
				name: getSeriesLabel(s, columnLabels),
				marker: { color },
			});
		}
	} else if (
		chartType === 'bar' ||
		chartType === 'stacked_bar' ||
		chartType === 'line' ||
		chartType === 'filled_area'
	) {
		const x = data.map((row) => row[xAxisKey]);
		const isAreaChart = chartType === 'line' || chartType === 'filled_area';
		for (let i = 0; i < series.length; i++) {
			const s = series[i];
			const color = resolveColor(s.color ?? '', i, resolvedColors);
			const y = data.map((row) => {
				const v = row[s.data_key];
				return typeof v === 'number' ? v : Number(v) || 0;
			});
			if (isAreaChart) {
				traces.push({
					type: 'scatter',
					mode: 'lines',
					x: x as Datum[],
					y: y as Datum[],
					name: getSeriesLabel(s, columnLabels),
					line: { color, width: 2 },
					fill: 'tozeroy',
					fillcolor: `${color}26`,
					visible: true,
				});
			} else {
				traces.push({
					type: 'bar',
					x: x as Datum[],
					y: y as Datum[],
					name: getSeriesLabel(s, columnLabels),
					marker: { color },
					visible: true,
				});
			}
		}
	} else if (chartType === 'bubble') {
		const scatterLabelKey = labelKey ?? xAxisKey;
		for (let i = 0; i < series.length; i++) {
			const s = series[i];
			const color = resolveColor(s.color ?? '', i, resolvedColors);
			const x = data.map((row) => row[xAxisKey]);
			const y = data.map((row) => {
				const v = row[s.data_key];
				return typeof v === 'number' ? v : Number(v) || 0;
			});
			const sizes = data.map((row) => {
				const sizeKey = s.size_key ?? s.data_key;
				const v = row[sizeKey];
				const num = typeof v === 'number' ? v : Number(v) || 0;
				return Math.max(5, Math.min(50, num * 2));
			});
			const text = data.map((row) => {
				const v = row[scatterLabelKey];
				return v != null ? labelize(v) : '';
			});
			traces.push({
				type: 'scatter',
				mode: 'markers',
				x: x as Datum[],
				y: y as Datum[],
				text,
				marker: { color, size: sizes, sizemode: 'diameter' },
				name: getSeriesLabel(s, columnLabels),
			});
		}
	} else if (chartType === 'scatter') {
		const scatterLabelKey = labelKey ?? xAxisKey;
		for (let i = 0; i < series.length; i++) {
			const s = series[i];
			const color = resolveColor(s.color ?? '', i, resolvedColors);
			const x = data.map((row) => row[xAxisKey]);
			const y = data.map((row) => {
				const v = row[s.data_key];
				return typeof v === 'number' ? v : Number(v) || 0;
			});
			const text = data.map((row) => {
				const v = row[scatterLabelKey];
				return v != null ? labelize(v) : '';
			});
			traces.push({
				type: 'scatter',
				mode: 'text+markers',
				x: x as Datum[],
				y: y as Datum[],
				text,
				textposition: 'top center',
				name: getSeriesLabel(s, columnLabels),
				marker: { color, size: 8 },
				visible: true,
			});
		}
	} else if (chartType === 'radar') {
		const theta = data.map((row) => labelize(row[xAxisKey]));
		for (let i = 0; i < series.length; i++) {
			const s = series[i];
			const color = resolveColor(s.color ?? '', i, resolvedColors);
			const r = data.map((row) => {
				const v = row[s.data_key];
				return typeof v === 'number' ? v : Number(v) || 0;
			});
			traces.push({
				type: 'scatterpolar',
				theta: [...theta, theta[0]],
				r: [...r, r[0]],
				name: getSeriesLabel(s, columnLabels),
				line: { color },
				fill: 'toself',
				fillcolor: `${color}80`,
				visible: true,
			});
		}
	} else if (chartType === 'funnel') {
		const x = data.map((row) => labelize(row[xAxisKey]));
		const y = data.map((row) => {
			const v = row[series[0].data_key];
			return typeof v === 'number' ? v : Number(v) || 0;
		});
		const color = resolveColor(series[0].color ?? '', 0, resolvedColors);
		traces.push({
			type: 'funnel',
			x,
			y: y as Datum[],
			marker: { color },
			textinfo: 'label+value',
		});
	} else if (chartType === 'funnelarea') {
		const labels = data.map((row) => labelize(row[xAxisKey]));
		const values = data.map((row) => {
			const v = row[series[0].data_key];
			return typeof v === 'number' ? v : Number(v) || 0;
		});
		const colors = data.map((_, idx) => resolveColor('', idx, resolvedColors));
		traces.push({
			type: 'funnelarea',
			labels,
			values,
			marker: { colors },
			textinfo: 'label+value',
		});
	} else if (chartType === 'table') {
		const header = series.map((s) => getSeriesLabel(s, columnLabels));
		const cells = series.map((s) =>
			data.map((row) => {
				const v = row[s.data_key];
				return v != null ? String(v) : '';
			}),
		);
		traces.push({
			type: 'table',
			header: { values: [labelize(xAxisKey), ...header], fill: { color: themeColors.border } },
			cells: {
				values: [data.map((row) => labelize(row[xAxisKey])), ...cells],
				fill: { color: [themeColors.background, themeColors.background] },
			},
		} as Data);
	} else if (chartType === 'candlestick' || chartType === 'ohlc') {
		if (!ohlcKeys) {
			return [];
		}
		const x = data.map((row) => row[xAxisKey]);
		const open = data.map((row) => Number(row[ohlcKeys.open]) || 0);
		const high = data.map((row) => Number(row[ohlcKeys.high]) || 0);
		const low = data.map((row) => Number(row[ohlcKeys.low]) || 0);
		const close = data.map((row) => Number(row[ohlcKeys.close]) || 0);
		traces.push({
			type: chartType === 'candlestick' ? 'candlestick' : 'ohlc',
			x: x as Datum[],
			open,
			high,
			low,
			close,
		});
	} else if (chartType === 'waterfall') {
		const x = data.map((row) => labelize(row[xAxisKey]));
		const y = data.map((row) => {
			const v = row[series[0].data_key];
			return typeof v === 'number' ? v : Number(v) || 0;
		});
		const measure = measureKey
			? data.map((row) => row[measureKey] as string)
			: data.map((_, i) => (i === 0 ? 'absolute' : i === data.length - 1 ? 'total' : 'relative'));
		traces.push({
			type: 'waterfall',
			x,
			y: y as Datum[],
			measure,
		} as Data);
	} else if (chartType === 'indicator') {
		const value = data.length > 0 ? Number(data[0][series[0].data_key]) || 0 : 0;
		const delta = series.length > 1 && data.length > 0 ? Number(data[0][series[1].data_key]) : undefined;
		const reference = series.length > 2 && data.length > 0 ? Number(data[0][series[2].data_key]) : undefined;
		traces.push({
			type: 'indicator',
			mode: 'number+delta',
			value,
			delta: delta != null ? { reference: reference ?? 0 } : undefined,
			number: { font: { color: themeColors.foreground } },
		});
	} else if (chartType === 'gauge') {
		const value = data.length > 0 ? Number(data[0][series[0].data_key]) || 0 : 0;
		const maxVal = Math.max(value * 1.2, 100);
		const threshold = maxVal * 0.8;
		traces.push({
			type: 'indicator',
			mode: 'gauge+number',
			value,
			gauge: {
				axis: { range: [0, maxVal], tickfont: { color: themeColors.mutedForeground } },
				bar: { color: resolveColor(series[0].color ?? '', 0, resolvedColors) },
				threshold: { value: threshold, line: { color: '#ef4444' } },
			},
		});
	} else if (chartType === 'radial_bar') {
		const dataKey = series[0].data_key;
		const theta = data.map((row) => labelize(row[xAxisKey]));
		const r = data.map((row) => {
			const v = row[dataKey];
			return typeof v === 'number' ? v : Number(v) || 0;
		});
		const colors = data.map((_, idx) => resolveColor('', idx, resolvedColors));
		traces.push({
			type: 'bar',
			theta,
			r: r as Datum[],
			marker: { color: colors },
		});
	} else {
		const dataKey = series[0].data_key;
		const labels = data.map((row) => labelize(row[xAxisKey]));
		const values = data.map((row) => {
			const v = row[dataKey];
			return typeof v === 'number' ? v : Number(v) || 0;
		});
		const colors = data.map((_, idx) => resolveColor('', idx, resolvedColors));
		traces.push({
			type: 'pie',
			labels,
			values,
			marker: { colors },
			textinfo: 'label+value',
			hovertemplate: '%{label}: %{value}<extra></extra>',
		});
	}
	return traces;
}

type XAxisTypeForLayout = 'number' | 'category' | 'date';

function getLayoutPatchForChart(
	chartType: displayChart.ChartType,
	data: Record<string, unknown>[],
	xAxisKey: string,
	xAxisType: XAxisTypeForLayout,
	formatTick: (v: unknown) => string,
	themeColors: Record<string, string>,
	showGrid: boolean,
): Partial<Layout> {
	const patch: Partial<Layout> = {};
	const x = data.map((row) => row[xAxisKey]);
	if (chartType === 'bar' || chartType === 'stacked_bar' || chartType === 'line' || chartType === 'filled_area') {
		patch.barmode = chartType === 'stacked_bar' ? 'stack' : 'group';
		if (xAxisType === 'number') {
			patch.xaxis = {};
		} else if (xAxisType === 'date') {
			patch.xaxis = { nticks: 10 };
		} else {
			const sampled = sampleTicks(x);
			patch.xaxis = {
				tickvals: sampled,
				ticktext: sampled.map((v) => formatTick(v)),
			};
		}
	}
	if (chartType === 'horizontal_bar') {
		patch.barmode = 'group';
		if (xAxisType !== 'number') {
			const yVals = x.map((v) => formatTick(v));
			const sampled = sampleTicks(yVals);
			patch.yaxis = {
				autorange: 'reversed',
				rangemode: 'normal',
				tickvals: sampled,
				ticktext: sampled,
			};
		} else {
			patch.yaxis = { autorange: 'reversed', rangemode: 'normal' };
		}
	}
	if (chartType === 'radar') {
		patch.polar = {
			radialaxis: {
				showgrid: showGrid,
				gridcolor: themeColors.border,
				tickfont: { color: themeColors.mutedForeground },
			},
			angularaxis: {
				showgrid: showGrid,
				gridcolor: themeColors.border,
				tickfont: { color: themeColors.mutedForeground },
			},
		};
	}
	if (
		[
			'pie',
			'radial_bar',
			'funnel',
			'funnelarea',
			'table',
			'indicator',
			'gauge',
			'candlestick',
			'ohlc',
			'waterfall',
		].includes(chartType)
	) {
		patch.showlegend = false;
	}
	if (['table', 'indicator', 'gauge', 'candlestick', 'ohlc'].includes(chartType)) {
		patch.xaxis = undefined;
		patch.yaxis = undefined;
	}
	if (chartType === 'radial_bar') {
		patch.polar = {
			radialaxis: { showticklabels: true, tickfont: { color: themeColors.mutedForeground } },
			angularaxis: {
				showgrid: showGrid,
				gridcolor: themeColors.border,
				tickfont: { color: themeColors.mutedForeground },
			},
		};
		patch.showlegend = false;
	}
	return patch;
}

function getDateFilterKeys(config: displayChart.Input | undefined): { xAxisKey: string; xAxisType: string | null } | null {
	if (!config) return null;
	const norm = displayChart.normalizeConfig(config);
	if (!norm) {
		return null;
	}
	if (norm.mode === 'single') {
		return { xAxisKey: norm.config.x_axis_key, xAxisType: norm.config.x_axis_type ?? null };
	}
	if (norm.mode === 'combined') {
		return { xAxisKey: norm.x_axis_key, xAxisType: norm.x_axis_type ?? null };
	}
	if (norm.mode === 'subplots' && norm.charts?.[0]) {
		return { xAxisKey: norm.charts[0].x_axis_key, xAxisType: norm.charts[0].x_axis_type ?? null };
	}
	return null;
}

export const DisplayChartToolCall = ({ toolPart }: ToolCallComponentProps<'display_chart'>) => {
	const { messages, isRunning } = useAgentContext();
	const config = toolPart.state !== 'input-streaming' ? toolPart.input : undefined;
	const output = toolPart.output;
	const [dataRange, setDataRange] = useState<DateRange>('all');

	const sourceData = useMemo(() => {
		if (!config?.query_id) return null;
		for (const message of messages) {
			for (const part of message.parts) {
				const found = findExecuteSqlOutput(part, config.query_id);
				if (found) return found;
			}
		}
		return null;
	}, [messages, config?.query_id]);

	const norm = useMemo(
		() =>
			config
				? displayChart.normalizeConfig(config) ?? tryInferConfig(config, sourceData ?? null)
				: null,
		[config, sourceData],
	);

	const dateKeys = useMemo(() => getDateFilterKeys(config), [config]);

	const filteredData = useMemo(() => {
		if (!sourceData?.data || !dateKeys) {
			return [];
		}
		if (dateKeys.xAxisType !== 'date') {
			return sourceData.data;
		}
		return filterByDateRange(sourceData.data, dateKeys.xAxisKey, dataRange);
	}, [sourceData, dateKeys, dataRange]);

	const chartData = useMemo(() => {
		if (dateKeys?.xAxisType === 'date' && filteredData.length === 0 && (sourceData?.data?.length ?? 0) > 0) {
			return sourceData!.data;
		}
		return filteredData;
	}, [filteredData, sourceData, dateKeys?.xAxisType]);

	const hasChartData = useMemo(() => {
		if (!config || !sourceData?.data?.length) {
			return false;
		}
		if (norm?.mode === 'subplots') {
			return (norm.charts?.length ?? 0) > 0;
		}
		if (norm?.mode === 'combined') {
			return (norm.layers?.length ?? 0) > 0;
		}
		if (norm?.mode === 'single') {
			const ohlcCharts = ['candlestick', 'ohlc'];
			if (ohlcCharts.includes(norm.config.chart_type) && norm.config.ohlc_keys) return true;
			return (norm.config.series?.length ?? 0) > 0;
		}
		return false;
	}, [config, norm, sourceData?.data?.length]);

	const chartContent = useMemo(() => {
		if (!hasChartData || !config || !norm) {
			return null;
		}
		const title = norm.mode === 'single' ? norm.config.title : norm.mode === 'subplots' ? norm.title : norm.title;
		const showDateSelector =
			dateKeys?.xAxisType === 'date' && (norm.mode !== 'single' || norm.config.chart_type !== 'pie');

		return (
			<div className='flex flex-col items-center my-4 gap-2 aspect-3/2'>
				{title && <span className='text-sm font-medium'>{title}</span>}
				{showDateSelector && (
					<div className='flex w-full justify-end items-center'>
						<ChartRangeSelector
							options={DATE_RANGE_OPTIONS}
							selectedRange={dataRange}
							onRangeSelected={(range) => setDataRange(range)}
						/>
					</div>
				)}

				{norm.mode === 'single' && (
					<ChartDisplay
						data={chartData}
						chartType={norm.config.chart_type}
						xAxisKey={norm.config.x_axis_key}
						series={norm.config.series}
						xAxisType={norm.config.x_axis_type ?? 'category'}
						labelKey={
							norm.config.chart_type === 'scatter'
								? (norm.config.label_key ?? norm.config.x_axis_key)
								: undefined
						}
						columnLabels={norm.config.column_labels}
						ohlcKeys={norm.config.ohlc_keys}
						measureKey={norm.config.measure_key}
					/>
				)}
				{norm.mode === 'subplots' && norm.charts?.length && (
					<SubplotsChartDisplay
						data={chartData}
						charts={norm.charts}
						grid={norm.grid}
						columnLabels={norm.column_labels}
					/>
				)}
				{norm.mode === 'combined' && norm.layers?.length && (
					<CombinedChartDisplay
						data={chartData}
						layers={norm.layers}
						xAxisKey={norm.x_axis_key}
						xAxisType={norm.x_axis_type ?? 'category'}
						columnLabels={norm.column_labels}
					/>
				)}
			</div>
		);
	}, [config, norm, chartData, dataRange, hasChartData, dateKeys?.xAxisType]);

	if (output && output.error) {
		return (
			<ToolCallWrapper defaultExpanded title='Could not display the chart'>
				<div className='p-4 text-red-400 text-sm'>{output.error}</div>
			</ToolCallWrapper>
		);
	}

	if (!config) {
		return (
			<div className='my-4 flex flex-col gap-2 items-center aspect-3/2'>
				<Skeleton className='w-1/2 h-4' />
				<Skeleton className='w-full flex-1 flex items-center justify-center gap-2'>
					<TextShimmer text='Loading chart' />
				</Skeleton>
			</div>
		);
	}

	const needsSeries =
		norm?.mode === 'single' &&
		(!['candlestick', 'ohlc'].includes(config.chart_type!) || !config.ohlc_keys) &&
		(config.series?.length ?? 0) === 0;
	if (needsSeries) {
		return (
			<div className='my-2 text-foreground/50 text-sm'>
				Could not display the chart because no series are configured.
			</div>
		);
	}

	if (!sourceData) {
		if (config?.query_id && isRunning) {
			return (
				<div className='my-4 flex flex-col gap-2 items-center aspect-3/2'>
					<Skeleton className='w-1/2 h-4' />
					<Skeleton className='w-full flex-1' />
					<TextShimmer text='Loading chart data...' />
				</div>
			);
		}
		return (
			<div className='my-2 text-foreground/50 text-sm'>
				Could not display the chart because the data is missing.
			</div>
		);
	}

	if (!sourceData.data || sourceData.data.length === 0) {
		return (
			<div className='my-2 text-foreground/50 text-sm'>
				Could not display the chart because the data is empty.
			</div>
		);
	}

	const validationError = validateChartData(config, sourceData);
	if (validationError) {
		return (
			<ToolCallWrapper defaultExpanded title='Could not display the chart'>
				<div className='p-4 text-red-400 text-sm'>{validationError}</div>
			</ToolCallWrapper>
		);
	}

	return chartContent;
};

function SubplotsChartDisplay({
	data,
	charts,
	grid,
	columnLabels,
}: {
	data: Record<string, unknown>[];
	charts: displayChart.ChartConfig[];
	grid?: displayChart.GridConfig;
	columnLabels?: Record<string, string>;
}) {
	const { theme } = useTheme();
	const resolvedColors = useMemo(() => getResolvedColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
	const themeColors = useMemo(() => getThemeColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
	const formatTick = useCallback((v: unknown) => labelize(v), []);

	const n = charts.length;
	const cols = grid?.columns ?? Math.ceil(Math.sqrt(n));
	const rows = grid?.rows ?? Math.ceil(n / cols);

	const { plotData, layout } = useMemo(() => {
		const allTraces: Data[] = [];
		const axisStyles = {
			showgrid: true,
			gridcolor: themeColors.border,
			tickfont: { color: themeColors.mutedForeground },
			zeroline: false,
		};

		const layoutAxes: Record<string, unknown> = {};
		const nonCartesianTypes = ['pie', 'funnel', 'funnelarea', 'table', 'indicator', 'gauge', 'radar', 'radial_bar'];

		const rowGap = rows > 1 ? 0.08 : 0;
		const plotHeight = (1 - rowGap * (rows - 1)) / rows;
		const colGap = cols > 1 ? 0.06 : 0;
		const plotWidth = (1 - colGap * (cols - 1)) / cols;

		const subplotDomain = (row: number, col: number) => {
			const xStart = col * (plotWidth + colGap);
			const yStart = (rows - 1 - row) * (plotHeight + rowGap);
			return {
				xDomain: [xStart, xStart + plotWidth] as [number, number],
				yDomain: [yStart, yStart + plotHeight] as [number, number],
			};
		};

		for (let i = 0; i < charts.length; i++) {
			const chart = charts[i];
			const row = Math.floor(i / cols);
			const col = i % cols;
			const { xDomain, yDomain } = subplotDomain(row, col);
			const suffix = i === 0 ? '' : String(i + 1);
			const isBottomRow = row === rows - 1;
			const xAxisType = (chart.x_axis_type ?? 'category') as XAxisTypeForLayout;

			const tickPatch = getLayoutPatchForChart(
				chart.chart_type,
				data,
				chart.x_axis_key,
				xAxisType,
				formatTick,
				themeColors,
				true,
			);
			const xAxisConfig: Record<string, unknown> = {
				...axisStyles,
				domain: xDomain,
				autorange: true,
				rangemode: 'normal',
				...(tickPatch.xaxis ?? {}),
				showticklabels: isBottomRow,
			};
			if (i > 0) {
				xAxisConfig.matches = 'x';
			}
			const yAxisConfig = {
				...axisStyles,
				domain: yDomain,
				autorange: true,
				rangemode: 'normal',
				...(tickPatch.yaxis ?? {}),
			};
			layoutAxes[`xaxis${suffix}`] = xAxisConfig;
			layoutAxes[`yaxis${suffix}`] = yAxisConfig;
		}

		for (let i = 0; i < charts.length; i++) {
			const chart = charts[i];
			const row = Math.floor(i / cols);
			const col = i % cols;
			const { xDomain, yDomain } = subplotDomain(row, col);
			const suffix = i === 0 ? '' : String(i + 1);
			const chartXAxisType = chart.x_axis_type === 'number' ? 'number' : 'category';
			const opts: BuildTracesOptions = {
				xAxisType: chartXAxisType,
				columnLabels,
				ohlcKeys: chart.ohlc_keys,
				measureKey: chart.measure_key,
				labelKey: chart.label_key,
				resolvedColors,
				themeColors,
				formatTick,
				showGrid: true,
			};
			const traces = buildTracesForChart(data, chart.chart_type, chart.x_axis_key, chart.series, opts);
			const useDomain = nonCartesianTypes.includes(chart.chart_type);
			for (const t of traces) {
				const trace = { ...t } as Record<string, unknown>;
				if (useDomain) {
					trace.domain = { x: xDomain, y: yDomain };
				} else {
					trace.xaxis = `x${suffix}`;
					trace.yaxis = `y${suffix}`;
				}
				allTraces.push(trace as Data);
			}
		}

		const annotations = charts
			.map((chart, i) => {
				if (!chart.title) {
					return null;
				}
				const row = Math.floor(i / cols);
				const col = i % cols;
				const { xDomain, yDomain } = subplotDomain(row, col);
				return {
					text: chart.title,
					font: { size: 12, color: themeColors.foreground },
					showarrow: false,
					x: (xDomain[0] + xDomain[1]) / 2,
					y: yDomain[1],
					xref: 'paper' as const,
					yref: 'paper' as const,
					xanchor: 'center' as const,
					yanchor: 'bottom' as const,
				};
			})
			.filter((a): a is NonNullable<typeof a> => a != null);

		const baseLayout: Partial<Layout> = {
			paper_bgcolor: 'transparent',
			plot_bgcolor: themeColors.background,
			font: { color: themeColors.foreground, size: 12 },
			margin: { t: 30, r: 20, b: 50, l: 50 },
			autosize: true,
			showlegend: true,
			legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0.5, xanchor: 'center' },
			grid: { rows, columns: cols, pattern: 'independent' },
			...layoutAxes,
			...(annotations.length > 0 && { annotations }),
		};

		const hasBarOrLine = charts.some((c) => ['bar', 'stacked_bar', 'line', 'filled_area'].includes(c.chart_type));
		if (hasBarOrLine) {
			baseLayout.barmode = charts.some((c) => c.chart_type === 'stacked_bar') ? 'stack' : 'group';
		}

		return { plotData: allTraces, layout: baseLayout };
	}, [data, charts, cols, rows, columnLabels, resolvedColors, themeColors, formatTick]);

	return (
		<div className='flex flex-col items-center gap-2 w-full'>
			<div className='w-full aspect-video min-h-[200px]'>
				{plotData.length > 0 ? (
					<Plot
						data={plotData}
						layout={layout}
						config={{ responsive: true, displayModeBar: false }}
						style={{ width: '100%', height: '100%' }}
						useResizeHandler
					/>
				) : (
					<div className='flex h-full min-h-[200px] items-center justify-center rounded border border-dashed text-sm text-muted-foreground'>
						No data to display. Ensure each subplot has series or ohlc_keys configured.
					</div>
				)}
			</div>
		</div>
	);
}

function CombinedChartDisplay({
	data,
	layers,
	xAxisKey,
	xAxisType,
	columnLabels,
}: {
	data: Record<string, unknown>[];
	layers: displayChart.LayerConfig[];
	xAxisKey: string;
	xAxisType: 'number' | 'category' | 'date';
	columnLabels?: Record<string, string>;
}) {
	const { theme } = useTheme();
	const resolvedColors = useMemo(() => getResolvedColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
	const themeColors = useMemo(() => getThemeColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
	const formatTick = useCallback((v: unknown) => labelize(v), []);

	const hasY2 = layers.some((l) => l.y_axis === 'y2');

	const { plotData, layout } = useMemo(() => {
		const allTraces: Data[] = [];

		for (const layer of layers) {
			const opts: BuildTracesOptions = {
				xAxisType,
				columnLabels,
				resolvedColors,
				themeColors,
				formatTick,
				showGrid: true,
			};
			const traces = buildTracesForChart(data, layer.chart_type, xAxisKey, layer.series, opts);
			const yAxis = layer.y_axis ?? 'y';
			for (const t of traces) {
				allTraces.push({
					...t,
					yaxis: yAxis,
				} as Data);
			}
		}

		const xAxisPatch = getLayoutPatchForChart(
			'line',
			data,
			xAxisKey,
			xAxisType as XAxisTypeForLayout,
			formatTick,
			themeColors,
			true,
		);
		const baseLayout: Partial<Layout> = {
			paper_bgcolor: 'transparent',
			plot_bgcolor: themeColors.background,
			font: { color: themeColors.foreground, size: 12 },
			margin: { t: 20, r: hasY2 ? 60 : 20, b: 40, l: 50 },
			autosize: true,
			showlegend: true,
			legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0.5, xanchor: 'center' },
			xaxis: {
				showgrid: true,
				gridcolor: themeColors.border,
				tickfont: { color: themeColors.mutedForeground },
				zeroline: false,
				...(xAxisPatch.xaxis ?? {}),
			},
			yaxis: {
				showgrid: true,
				gridcolor: themeColors.border,
				tickfont: { color: themeColors.mutedForeground },
				zeroline: false,
				autorange: true,
				rangemode: 'normal',
			},
			barmode: layers.some((l) => l.chart_type === 'stacked_bar') ? 'stack' : 'group',
		};

		if (hasY2) {
			baseLayout.yaxis2 = {
				overlaying: 'y',
				side: 'right',
				showgrid: false,
				tickfont: { color: themeColors.mutedForeground },
				zeroline: false,
				autorange: true,
				rangemode: 'normal',
			};
		}

		return { plotData: allTraces, layout: baseLayout };
	}, [data, layers, xAxisKey, xAxisType, columnLabels, resolvedColors, themeColors, formatTick, hasY2]);

	return (
		<div className='flex flex-col items-center gap-2 w-full'>
			<div className='w-full aspect-video min-h-[200px]'>
				{plotData.length > 0 ? (
					<Plot
						data={plotData}
						layout={layout}
						config={{ responsive: true, displayModeBar: false }}
						style={{ width: '100%', height: '100%' }}
						useResizeHandler
					/>
				) : (
					<div className='flex h-full min-h-[200px] items-center justify-center rounded border border-dashed text-sm text-muted-foreground'>
						No data to display. Ensure each layer has at least one series configured.
					</div>
				)}
			</div>
		</div>
	);
}

export interface ChartDisplayProps {
	data: Record<string, unknown>[];
	chartType: displayChart.ChartType;
	xAxisKey: string;
	xAxisType: 'number' | 'category' | 'date';
	xAxisLabelFormatter?: (value: string) => string;
	series: displayChart.SeriesConfig[];
	title?: string;
	showGrid?: boolean;
	labelKey?: string;
	columnLabels?: Record<string, string>;
	ohlcKeys?: { open: string; high: string; low: string; close: string };
	measureKey?: string;
}

export const ChartDisplay = React.memo(function ChartDisplay({
	data,
	chartType,
	xAxisKey,
	xAxisType,
	xAxisLabelFormatter,
	series,
	title,
	showGrid = true,
	labelKey,
	columnLabels,
	ohlcKeys,
	measureKey,
}: ChartDisplayProps) {
	const { theme } = useTheme();
	const { visibleSeries } = useSeriesVisibility(series);
	const resolvedColors = useMemo(() => getResolvedColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps -- theme triggers CSS var re-read
	const themeColors = useMemo(() => getThemeColors(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps -- theme triggers CSS var re-read

	const formatTick = React.useCallback(
		(value: unknown) => xAxisLabelFormatter?.(String(value)) ?? labelize(value),
		[xAxisLabelFormatter],
	);

	const { plotData, layout } = useMemo(() => {
		const opts: BuildTracesOptions = {
			xAxisType,
			columnLabels,
			ohlcKeys,
			measureKey,
			labelKey: chartType === 'scatter' ? (labelKey ?? xAxisKey) : undefined,
			resolvedColors,
			themeColors,
			formatTick,
			showGrid,
		};
		const traces = buildTracesForChart(data, chartType, xAxisKey, visibleSeries, opts);
		const baseLayout: Partial<Layout> = {
			paper_bgcolor: 'transparent',
			plot_bgcolor: themeColors.background,
			font: { color: themeColors.foreground, size: 12 },
			margin: { t: 20, r: 20, b: 40, l: 50 },
			autosize: true,
			showlegend: ![
				'pie',
				'radial_bar',
				'funnel',
				'funnelarea',
				'table',
				'indicator',
				'gauge',
				'candlestick',
				'ohlc',
				'waterfall',
			].includes(chartType),
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
		const patch = getLayoutPatchForChart(
			chartType,
			data,
			xAxisKey,
			xAxisType as XAxisTypeForLayout,
			formatTick,
			themeColors,
			showGrid,
		);
		if (patch.barmode) {
			baseLayout.barmode = patch.barmode;
		}
		if (patch.xaxis) {
			baseLayout.xaxis = { ...baseLayout.xaxis, ...patch.xaxis };
		}
		if (patch.yaxis) {
			baseLayout.yaxis = { ...baseLayout.yaxis, ...patch.yaxis };
		}
		if (patch.polar) {
			baseLayout.polar = patch.polar;
		}
		if (patch.showlegend !== undefined) {
			baseLayout.showlegend = patch.showlegend;
		}
		if (patch.xaxis === undefined) {
			baseLayout.xaxis = undefined;
		}
		if (patch.yaxis === undefined) {
			baseLayout.yaxis = undefined;
		}
		return { plotData: traces, layout: baseLayout };
	}, [
		data,
		chartType,
		xAxisKey,
		xAxisType,
		visibleSeries,
		columnLabels,
		showGrid,
		labelKey,
		ohlcKeys,
		measureKey,
		resolvedColors,
		themeColors,
		formatTick,
	]);

	return (
		<div className='flex flex-col items-center gap-2 w-full'>
			{title && <span className='text-sm font-medium'>{title}</span>}
			<div className='w-full aspect-video min-h-[200px]'>
				{plotData.length > 0 ? (
					<Plot
						data={plotData}
						layout={layout}
						config={{ responsive: true, displayModeBar: false }}
						style={{ width: '100%', height: '100%' }}
						useResizeHandler
					/>
				) : (
					<div className='flex h-full min-h-[200px] items-center justify-center rounded border border-dashed text-sm text-muted-foreground'>
						No data to display. Add at least one series with valid columns.
					</div>
				)}
			</div>
		</div>
	);
});

/** Manages which series are visible and hidden */
const useSeriesVisibility = (series: displayChart.SeriesConfig[]) => {
	const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<Set<string>>(new Set());

	const seriesKeysStr = useMemo(() => JSON.stringify(series.map((s) => s.data_key).sort()), [series]);

	useEffect(() => {
		setHiddenSeriesKeys((prev) => {
			const keys = new Set(series.map((s) => s.data_key));
			return new Set([...prev].filter((k) => keys.has(k)));
		});
	}, [seriesKeysStr]); // eslint-disable-line react-hooks/exhaustive-deps -- seriesKeysStr is stable proxy for series

	const visibleSeries = useMemo(
		() => series.filter((s) => !hiddenSeriesKeys.has(s.data_key)),
		[series, hiddenSeriesKeys],
	);

	return {
		visibleSeries,
		hiddenSeriesKeys,
		handleToggleSeriesVisibility: (dataKey: string) => {
			setHiddenSeriesKeys((prev) => {
				const copy = new Set(prev);
				if (copy.has(dataKey)) {
					copy.delete(dataKey);
				} else {
					copy.add(dataKey);
				}
				return copy;
			});
		},
	};
};
