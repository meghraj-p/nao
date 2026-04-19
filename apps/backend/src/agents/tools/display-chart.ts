import { displayChart } from '@nao/shared/tools';
import { tool } from 'ai';

import { DisplayChartOutput, renderToModelOutput } from '../../components/tool-outputs';

export default tool<displayChart.Input, displayChart.Output>({
	description:
		'Display a chart visualization of the data from a previous execute_sql tool call. For line and area charts, the SQL result must be in wide format: one row per x-axis value (e.g. date) with separate columns for each series to plot. Long format (one row per series per x-value) will not render correctly.',
	inputSchema: displayChart.InputSchema,
	outputSchema: displayChart.OutputSchema,

	execute: async ({ chart_type: chartType, x_axis_key: xAxisKey, series }) => {
		if (['bar', 'line', 'area', 'stacked_area', 'scatter', 'radar'].includes(chartType) && !xAxisKey) {
			return { _version: '1', success: false, error: `xAxisKey is required for ${chartType} charts.` };
		}

		if (series.length === 0) {
			return { _version: '1', success: false, error: 'At least one series is required.' };
		}

		if (chartType === 'pie' && series.length !== 1) {
			return { _version: '1', success: false, error: 'Pie charts require exactly one series.' };
		}

		// Stacked charts require at least two series
		if ((chartType === 'stacked_bar' || chartType === 'stacked_area') && series.length < 2) {
			return {
				_version: '1',
				success: false,
				error: `Stacked ${chartType === 'stacked_bar' ? 'bar' : 'area'} chart requires at least two series. You may need to pivot the data to create a series for each stack.`,
			};
		}

		// TODO: check that the chart is displayable and that the data is valid

		return { _version: '1', success: true };
	},

	toModelOutput: ({ output }) => renderToModelOutput(DisplayChartOutput({ output }), output),
});
