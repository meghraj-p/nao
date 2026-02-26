import { displayChart } from '@nao/shared/tools';
import { tool } from 'ai';

import { DisplayChartOutput, renderToModelOutput } from '../../components/tool-outputs';
import { env } from '../../env';
import { getQueryResult } from './execute-sql';

const MAX_CHART_ROWS = 50_000;

async function executeChartPython(
	pythonCode: string,
	data: Record<string, unknown>[],
): Promise<{ html: string } | { error: string }> {
	const response = await fetch(`http://localhost:${env.FASTAPI_PORT}/execute_chart_python`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ python_code: pythonCode, data }),
	});

	const result = await response.json();
	if (!response.ok) {
		return { error: result.detail ?? response.statusText };
	}
	return result;
}

export default tool<displayChart.Input, displayChart.Output>({
	description:
		'Display a Plotly chart by executing Python code. Use query_id from a previous execute_sql output. Write Python code that creates a plotly Figure and assigns it to `fig`. Pre-imported: df (DataFrame), pd, px (plotly.express), go (plotly.graph_objects), np, math, datetime.',
	inputSchema: displayChart.InputSchema,
	outputSchema: displayChart.OutputSchema,

	execute: async ({ query_id, python_code }) => {
		const cached = getQueryResult(query_id);
		if (!cached) {
			return { success: false, error: `No cached data found for query_id "${query_id}". The data may have expired or the server restarted.` };
		}

		if (cached.data.length > MAX_CHART_ROWS) {
			return { success: false, error: `Dataset has ${cached.data.length} rows which exceeds the ${MAX_CHART_ROWS} row limit for chart rendering. Use a SQL query with aggregation or LIMIT to reduce the data size.` };
		}

		const result = await executeChartPython(python_code, cached.data);

		if ('error' in result) {
			return { success: false, error: result.error, failed_code: python_code };
		}

		return { success: true, html: result.html };
	},

	toModelOutput: ({ output }) => renderToModelOutput(DisplayChartOutput({ output }), output),
});
