import type { displayChart } from '@nao/shared/tools';

import { Block } from '../../lib/markdown';

export function DisplayChartOutput({ output }: { output: displayChart.Output }) {
	if (output.error) {
		return (
			<Block>
				Chart execution failed: {output.error}
				{output.failed_code && `\nFailed code:\n${output.failed_code}`}
			</Block>
		);
	}
	return <Block>Chart displayed successfully.</Block>;
}
