import React, { useState } from 'react';
import { Streamdown } from 'streamdown';
import { ArrowUpRight, Code, Copy, Table as TableIcon } from 'lucide-react';
import { ToolCallWrapper } from './tool-call-wrapper';
import type { ToolCallComponentProps } from '.';
import { isToolSettled } from '@/lib/ai';
import { useSidePanel } from '@/contexts/side-panel';
import { SidePanelContent } from '@/components/side-panel/sql-editor';
import { useDebounceValue } from '@/hooks/use-debounce-value';

type ViewMode = 'results' | 'query';

const DEBOUNCE_MS = 400;

export const ExecuteSqlToolCall = React.memo(function ExecuteSqlToolCall({
	toolPart,
}: ToolCallComponentProps<'execute_sql'>) {
	const [viewMode, setViewMode] = useState<ViewMode>('results');
	const isSettled = isToolSettled(toolPart);
	const isInputStreaming = toolPart.state === 'input-streaming';
	const { open: openSidePanel } = useSidePanel();

	const sqlQuery = toolPart.input?.sql_query ?? '';
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
				navigator.clipboard.writeText(toolPart.input?.sql_query ?? '');
			},
		},
		{
			id: 'expand',
			label: <ArrowUpRight className='size-3' />,
			onClick: () => {
				if (isInputStreaming || !toolPart.output || !toolPart.input) {
					return;
				}
				openSidePanel(<SidePanelContent input={toolPart.input} output={toolPart.output} />);
			},
		},
	];

	const displaySql = isInputStreaming ? debouncedSql : sqlQuery;
	const titleContent = isInputStreaming ? (
		<span>{isSettled ? 'Executed' : 'Executing'}…</span>
	) : (
		<span>
			{isSettled ? 'Executed' : 'Executing'}{' '}
			<span className='text-xs font-normal truncate'>{displaySql}</span>
		</span>
	);

	return (
		<ToolCallWrapper
			defaultExpanded={false}
			overrideError={viewMode === 'query'}
			title={titleContent}
			badge={toolPart.output?.row_count && `${toolPart.output.row_count} rows`}
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
			) : toolPart.output ? (
				<div className='overflow-auto max-h-80'>
					<table className='text-sm border-collapse w-full'>
						<thead>
							<tr className='border-b border-border'>
								{toolPart.output.columns.map((column, i) => (
									<th
										key={i}
										className='text-left p-2.5 font-medium text-foreground/70 bg-background sticky top-0'
									>
										{column}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{toolPart.output.data?.map((row, rowIndex) => (
								<tr key={rowIndex} className='border-b border-border/50 hover:bg-background/30'>
									{Object.values(row).map((value, cellIndex) => (
										<td key={cellIndex} className='p-2.5 font-mono text-xs'>
											{value === null ? (
												<span className='text-foreground/30 italic'>NULL</span>
											) : (
												String(value)
											)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
					{toolPart.output.row_count === 0 && (
						<div className='p-4 text-center text-foreground/50 text-sm'>No rows returned</div>
					)}
				</div>
			) : (
				<div className='p-4 text-center text-foreground/50 text-sm'>Executing query...</div>
			)}
		</ToolCallWrapper>
	);
});
