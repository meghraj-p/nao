export interface RenderChartInput {
	config: Record<string, unknown>;
	data: Record<string, unknown>[];
	width?: number;
	height?: number;
}

/**
 * SSR chart image generation is not supported when using the Plotly charting backend.
 * Charts are rendered client-side via the Plotly Python sandbox instead.
 */
export function generateChartImage(_input: RenderChartInput): Buffer {
	throw new Error('generateChartImage is not available: charts use the Plotly Python sandbox.');
}
