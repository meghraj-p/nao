import type { displayChart } from '@nao/shared/tools';

import { Block, List, ListItem, Span, Title } from '../../lib/markdown';

export function DisplayChartOutput({ output }: { output: displayChart.Output }) {
	if (output.error) {
		return (
			<Block>
				Chart execution failed: {output.error}
				{output.failed_code && `\nFailed code:\n${output.failed_code}`}
			</Block>
		);
	}

	const entries = output.computed_values ? Object.entries(output.computed_values) : [];

	return (
		<Block>
			<Span>Chart displayed successfully.</Span>
			{entries.length > 0 && (
				<Block>
					<Title level={3}>Computed values from chart code</Title>
					<List>
						{entries.map(([key, value]) => (
							<ListItem>
								{key}: {value}
							</ListItem>
						))}
					</List>
				</Block>
			)}
		</Block>
	);
}
