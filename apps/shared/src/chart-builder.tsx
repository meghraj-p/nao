export const DEFAULT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea'];

export function labelize(key: unknown): string {
	const str = String(key);
	if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
		const date = new Date(str);
		if (!isNaN(date.getTime())) {
			return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
		}
	}
	return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function defaultColorFor(_key: string, index: number): string {
	return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export interface BuildChartProps {
	data: Record<string, unknown>[];
	chartType: string;
	xAxisKey: string;
	xAxisType?: 'number' | 'category';
	series: { data_key: string; label?: string; color?: string }[];
	colorFor?: (key: string, index: number) => string;
	labelFormatter?: (value: string) => string;
	showGrid?: boolean;
	children?: unknown[];
	margin?: { top?: number; right?: number; bottom?: number; left?: number };
	title?: string;
}

/**
 * SSR chart building is not supported when using the Plotly charting backend.
 * Charts are rendered client-side via the Plotly Python sandbox instead.
 */
export function buildChart(_props: BuildChartProps): never {
	throw new Error('buildChart is not available: charts use the Plotly Python sandbox.');
}
