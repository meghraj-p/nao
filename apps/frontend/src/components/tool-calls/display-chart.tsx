import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import { buildPlotlyFigure, DEFAULT_COLORS, DEFAULT_THEME } from '@nao/shared';
import { Skeleton } from '../ui/skeleton';
import { TextShimmer } from '../ui/text-shimmer';
import { ToolCallWrapper } from './tool-call-wrapper';
import type { ToolCallComponentProps } from '.';
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

	const { data: plotData, layout } = useMemo(
		() => buildPlotlyFigure({ data, chartType, xAxisKey, xAxisType, series, title, resolvedColors, themeColors }),
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
			data={plotData as unknown as Plotly.Data[]}
			layout={layout as unknown as Partial<Plotly.Layout>}
			config={{ responsive: true, displayModeBar: false }}
			style={{ width: '100%', height: '100%' }}
			useResizeHandler
		/>
	);
}

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
		return DEFAULT_COLORS;
	}
	const styles = getComputedStyle(document.documentElement);
	return CHART_CSS_VARS.map((v) => getCssVar(styles, v, '#6366f1'));
}

function getThemeColors() {
	if (typeof document === 'undefined') {
		return DEFAULT_THEME;
	}
	const styles = getComputedStyle(document.documentElement);
	return {
		background: getCssVar(styles, '--background', 'transparent'),
		foreground: getCssVar(styles, '--foreground', '#000000'),
		mutedForeground: getCssVar(styles, '--muted-foreground', '#6b7280'),
		border: getCssVar(styles, '--border', '#e5e7eb'),
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
			setHeight((prev) => (prev === contentHeight ? prev : contentHeight));
		}
	}, []);

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) {
			return;
		}

		const handleLoad = () => {
			syncHeight();
		};

		iframe.addEventListener('load', handleLoad);
		return () => {
			iframe.removeEventListener('load', handleLoad);
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
