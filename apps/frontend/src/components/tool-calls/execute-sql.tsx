import React, { useState } from 'react';
import { Streamdown } from 'streamdown';
import { ArrowUpRight, Code, Copy, Table as TableIcon } from 'lucide-react';
import { ToolCallWrapper } from './tool-call-wrapper';
import { TableDisplay } from './display-table';
import type { ToolCallComponentProps } from '.';
import { useSidePanel } from '@/contexts/side-panel';
import { useToolCallContext } from '@/contexts/tool-call';
import { SidePanelContent } from '@/components/side-panel/sql-editor';
import { useDebounceValue } from '@/hooks/use-debounce-value';

type ViewMode = 'results' | 'query';

const DEBOUNCE_MS = 400;

export const ExecuteSqlToolCall = ({ toolPart: { output, input, state } }: ToolCallComponentProps<'execute_sql'>) => {
	const [viewMode, setViewMode] = useState<ViewMode>('results');
	const { isSettled } = useToolCallContext();
	const isInputStreaming = state === 'input-streaming';
	const { open: openSidePanel } = useSidePanel();

	const sqlQuery = input?.sql_query ?? '';
	const debouncedSql = useDebounceValue(sqlQuery, {
		delay: DEBOUNCE_MS,
		skipDebounce: () => !isInputStreaming,
	});

	const actions = [
		{
			id: 'results',
			label: <TableIcon className='size-3' />,
			expandOnClick: true,
			isActive: viewMode === 'results',
			onClick: () => setViewMode('results'),
		},
		{
			id: 'query',
			label: <Code className='size-3' />,
			expandOnClick: true,
			isActive: viewMode === 'query',
			onClick: () => setViewMode('query'),
		},
		{
			id: 'copy',
			label: <Copy className='size-3' />,
			onClick: () => {
				navigator.clipboard.writeText(input?.sql_query ?? '');
			},
		},
		{
			id: 'expand',
			label: <ArrowUpRight className='size-3' />,
			onClick: () => {
				if (state === 'input-streaming' || !output || !input) {
					return;
				}
				openSidePanel(<SidePanelContent input={input} output={output} />);
			},
		},
	];

	const displaySql = isInputStreaming ? debouncedSql : sqlQuery;
	const titleContent = isInputStreaming ? (
		<span>{isSettled ? 'Executed' : 'Executing'}…</span>
	) : (
		<span>
			{isSettled ? 'Executed' : 'Executing'} <span className='text-xs font-normal truncate'>{displaySql}</span>
		</span>
	);

	return (
		<ToolCallWrapper
			defaultExpanded={false}
			overrideError={viewMode === 'query'}
			title={titleContent}
			badge={output?.row_count && `${output.row_count} rows`}
			actions={isSettled ? actions : []}
		>
			{viewMode === 'query' && displaySql ? (
				<div className='overflow-auto max-h-80 hide-code-header'>
					{isInputStreaming ? (
						<pre className='p-3 text-sm font-mono overflow-auto'>
							<code>{displaySql}</code>
						</pre>
					) : (
						<Streamdown mode='static' controls={{ code: false }}>
							{`\`\`\`sql\n${displaySql}\n\`\`\``}
						</Streamdown>
					)}
				</div>
			) : output ? (
				<TableDisplay
					data={output.data as Record<string, unknown>[]}
					columns={output.columns}
					tableContainerClassName='max-h-80 rounded-none border-0 bg-transparent'
					showRowCount={false}
				/>
			) : (
				<div className='p-4 text-center text-foreground/50 text-sm'>Executing query...</div>
			)}
		</ToolCallWrapper>
	);
};
