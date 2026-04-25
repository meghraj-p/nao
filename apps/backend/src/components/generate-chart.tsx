export interface RenderChartInput {
	config: Record<string, unknown>;
	data: Record<string, unknown>[];
	width?: number;
	height?: number;
	margin?: { top?: number; right?: number; bottom?: number; left?: number };
	includeLegend?: boolean;
}

/**
 * SSR chart image generation is not supported when using the Plotly charting backend.
 * Charts are rendered client-side via the Plotly Python sandbox instead.
 * TODO: implement PNG rendering via FastAPI /render_chart_png + kaleido.
 */
export function generateChartImage(_input: RenderChartInput): Buffer {
	throw new Error('generateChartImage is not available: charts use the Plotly Python sandbox.');
}

export function renderChartToSvg(_input: RenderChartInput): string {
	throw new Error('renderChartToSvg is not available: charts use the Plotly Python sandbox.');
}
