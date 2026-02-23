import React, { useState } from 'react';
import { Streamdown } from 'streamdown';
import { Code, Copy, Terminal } from 'lucide-react';
import { ToolCallWrapper } from './tool-call-wrapper';
import type { ToolCallComponentProps } from '.';
import { isToolSettled } from '@/lib/ai';
import { useDebounceValue } from '@/hooks/use-debounce-value';

type ViewMode = 'output' | 'code';

const DEBOUNCE_MS = 400;

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

export const ExecutePythonToolCall = React.memo(function ExecutePythonToolCall({
	toolPart,
}: ToolCallComponentProps<'execute_python'>) {
	const [viewMode, setViewMode] = useState<ViewMode>('output');
	const input = toolPart.input;
	const output = toolPart.output;
	const isSettled = isToolSettled(toolPart);
	const isInputStreaming = toolPart.state === 'input-streaming';

	const code = input?.code ?? '';
	const debouncedCode = useDebounceValue(code, {
		delay: DEBOUNCE_MS,
		skipDebounce: () => !isInputStreaming,
	});
	const displayCode = isInputStreaming ? debouncedCode : code;

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

	const codePreview = displayCode ? (displayCode.length > 50 ? `${displayCode.slice(0, 50)}...` : displayCode) : '';
	const titleContent = isInputStreaming ? (
		<span>{isSettled ? 'Ran Python' : 'Running Python'}…</span>
	) : (
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
			{viewMode === 'code' && displayCode ? (
				<div className='overflow-auto max-h-80 hide-code-header'>
					{isInputStreaming ? (
						<pre className='p-3 text-sm font-mono overflow-auto'>
							<code>{displayCode}</code>
						</pre>
					) : (
						<Streamdown mode='static' controls={{ code: false }}>
							{`\`\`\`python\n${displayCode}\n\`\`\``}
						</Streamdown>
					)}
				</div>
			) : output ? (
				<div className='overflow-auto max-h-80'>
					{/* Output value */}
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
});
