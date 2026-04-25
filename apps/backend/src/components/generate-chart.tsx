import { env } from '../env';

export interface RenderChartInput {
	config: { python_code?: string; query_id?: string } & Record<string, unknown>;
	data: Record<string, unknown>[];
	width?: number;
	height?: number;
	margin?: { top?: number; right?: number; bottom?: number; left?: number };
	includeLegend?: boolean;
}

export async function generateChartImage(input: RenderChartInput): Promise<Buffer> {
	const pythonCode = input.config?.python_code;
	if (typeof pythonCode !== 'string' || pythonCode.length === 0) {
		throw new Error('generateChartImage requires config.python_code (Plotly chart code).');
	}

	const response = await fetch(`http://localhost:${env.FASTAPI_PORT}/render_chart_png`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			python_code: pythonCode,
			data: input.data,
			width: input.width ?? 800,
			height: input.height ?? 500,
		}),
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => response.statusText);
		throw new Error(`Failed to render chart PNG: ${detail}`);
	}

	return Buffer.from(await response.arrayBuffer());
}

export function renderChartToSvg(_input: RenderChartInput): string {
	throw new Error('renderChartToSvg is not available: charts use the Plotly Python sandbox.');
}
