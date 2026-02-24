import { displayChart } from '@nao/shared/tools';
import { tool } from 'ai';

import { DisplayChartOutput, renderToModelOutput } from '../../components/tool-outputs';

export default tool<displayChart.Input, displayChart.Output>({
	description:
		'Display a chart visualization of the data from a previous execute_sql tool call. Use query_id from the execute_sql output. Column names in x_axis_key, series[].data_key, and ohlc_keys must match the execute_sql result columns exactly. For line and area charts, the SQL result must be in wide format: one row per x-axis value (e.g. date) with separate columns for each series. Long format will not render correctly.',
	inputSchema: displayChart.InputSchema,
	outputSchema: displayChart.OutputSchema,

	execute: async (input) => {
		const norm = displayChart.normalizeConfig(input);
		if (!norm) {
			return { _version: '1', success: false, error: 'Invalid chart configuration.' };
		}

		if (norm.mode === 'subplots') {
			for (let i = 0; i < norm.charts.length; i++) {
				const chart = norm.charts[i];
				const needsXAxis = [
					'bar',
					'stacked_bar',
					'line',
					'filled_area',
					'scatter',
					'bubble',
					'radar',
					'radial_bar',
					'horizontal_bar',
					'funnel',
					'funnelarea',
					'table',
					'candlestick',
					'ohlc',
					'waterfall',
				];
				if (needsXAxis.includes(chart.chart_type) && !chart.x_axis_key) {
					return { _version: '1', success: false, error: `Subplot ${i + 1}: x_axis_key is required for ${chart.chart_type} charts.` };
				}
				const ohlcCharts = ['candlestick', 'ohlc'];
				if (ohlcCharts.includes(chart.chart_type)) {
					if (!chart.ohlc_keys) {
						return { _version: '1', success: false, error: `Subplot ${i + 1}: ${chart.chart_type} charts require ohlc_keys.` };
					}
				} else if (!chart.series?.length) {
					return { _version: '1', success: false, error: `Subplot ${i + 1}: at least one series is required.` };
				}
				const singleSeriesCharts = ['pie', 'radial_bar', 'funnel', 'funnelarea', 'waterfall', 'gauge'];
				if (singleSeriesCharts.includes(chart.chart_type) && chart.series.length > 1) {
					return { _version: '1', success: false, error: `Subplot ${i + 1}: ${chart.chart_type} requires exactly one series.` };
				}
				if (chart.chart_type === 'indicator' && chart.series.length > 3) {
					return { _version: '1', success: false, error: `Subplot ${i + 1}: indicator supports at most 3 series.` };
				}
			}
			return { _version: '1', success: true };
		}

		if (norm.mode === 'combined') {
			for (let i = 0; i < norm.layers.length; i++) {
				const layer = norm.layers[i];
				if (!layer.series?.length) {
					return { _version: '1', success: false, error: `Layer ${i + 1}: at least one series is required.` };
				}
			}
			return { _version: '1', success: true };
		}

		// Single mode
		const { chart_type: chartType, x_axis_key: xAxisKey, series, ohlc_keys: ohlcKeys } = norm.config;
		const needsXAxis = [
			'bar',
			'stacked_bar',
			'line',
			'filled_area',
			'scatter',
			'bubble',
			'radar',
			'radial_bar',
			'horizontal_bar',
			'funnel',
			'funnelarea',
			'table',
			'candlestick',
			'ohlc',
			'waterfall',
		];
		if (needsXAxis.includes(chartType) && !xAxisKey) {
			return { _version: '1', success: false, error: `x_axis_key is required for ${chartType} charts.` };
		}
		const ohlcCharts = ['candlestick', 'ohlc'];
		if (ohlcCharts.includes(chartType)) {
			if (!ohlcKeys) {
				return { _version: '1', success: false, error: `${chartType} charts require ohlc_keys (open, high, low, close).` };
			}
		} else if (!series || series.length === 0) {
			return { _version: '1', success: false, error: 'At least one series is required for this chart type.' };
		}
		const singleSeriesCharts = ['pie', 'radial_bar', 'funnel', 'funnelarea', 'waterfall', 'gauge'];
		if (singleSeriesCharts.includes(chartType) && series.length > 1) {
			return { _version: '1', success: false, error: `${chartType} charts require exactly one series.` };
		}
		if (chartType === 'indicator' && series.length > 3) {
			return { _version: '1', success: false, error: 'Indicator charts support at most 3 series (value, delta, reference).' };
		}
		return { _version: '1', success: true };
	},

	toModelOutput: ({ output }) => renderToModelOutput(DisplayChartOutput({ output }), output),
});
