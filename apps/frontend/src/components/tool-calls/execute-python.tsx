import React, { useState } from 'react';
import { Streamdown } from 'streamdown';
import { Code, Copy, Terminal } from 'lucide-react';
import { ToolCallWrapper } from './tool-call-wrapper';
import type { ToolCallComponentProps } from '.';
import { useToolCallContext } from '@/contexts/tool-call';

type ViewMode = 'output' | 'code';

const formatOutput = (value: unknown): string => {
	if (value === null) {
		return 'null';
	}
	if (value === undefined) {
		return 'undefined';
	}
	if (typeof value === 'object') {
		return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
	}
	return `\`\`\`bash\n${String(value)}\n\`\`\``;
};

export const ExecutePythonToolCall = ({ toolPart: { output, input } }: ToolCallComponentProps<'execute_python'>) => {
	const [viewMode, setViewMode] = useState<ViewMode>('output');
	const { isSettled } = useToolCallContext();

	const actions = [
		{
			id: 'output',
			label: <Terminal size={12} />,
			isActive: viewMode === 'output',
			onClick: () => setViewMode('output'),
		},
		{
			id: 'code',
			label: <Code size={12} />,
			isActive: viewMode === 'code',
			onClick: () => setViewMode('code'),
		},
		{
			id: 'copy',
			label: <Copy size={12} />,
			onClick: () => {
				navigator.clipboard.writeText(input?.code ?? '');
			},
		},
	];

	const code = input?.code ?? '';
	const codePreview = code ? (code.length > 50 ? `${code.slice(0, 50)}...` : code) : '';
	const titleContent = (
		<span>
			{isSettled ? 'Ran Python' : 'Running Python'}{' '}
			<span className='text-xs font-normal truncate'>{codePreview.replace(/\n/g, ' ')}</span>
		</span>
	);

	return (
		<ToolCallWrapper
			defaultExpanded={false}
			overrideError={viewMode === 'code'}
			title={titleContent}
			actions={isSettled ? actions : []}
		>
			{viewMode === 'code' && code ? (
				<div className='overflow-auto max-h-80 hide-code-header'>
					<Streamdown mode='static' controls={{ code: false }}>
						{`\`\`\`python\n${code}\n\`\`\``}
					</Streamdown>
				</div>
			) : output ? (
				<div className='overflow-auto max-h-80'>
					<div>
						<pre className='font-mono text-sm rounded overflow-auto hide-code-header'>
							<Streamdown mode='static' controls={{ code: false }}>
								{formatOutput(output.output)}
							</Streamdown>
						</pre>
					</div>
				</div>
			) : (
				<div className='p-4 text-center text-foreground/50 text-sm'>Executing Python...</div>
			)}
		</ToolCallWrapper>
	);
};
