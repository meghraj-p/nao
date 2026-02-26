import { useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton } from '../ui/skeleton';
import { TextShimmer } from '../ui/text-shimmer';
import { ToolCallWrapper } from './tool-call-wrapper';
import type { ToolCallComponentProps } from '.';

export const DisplayChartToolCall = ({ toolPart }: ToolCallComponentProps<'display_chart'>) => {
	const output = toolPart.output;
	const html = output?.html;

	if (output?.error) {
		return (
			<ToolCallWrapper defaultExpanded title='Could not display the chart'>
				<div className='p-4 text-red-400 text-sm whitespace-pre-wrap font-mono'>{output.error}</div>
			</ToolCallWrapper>
		);
	}

	if (!html) {
		return (
			<div className='my-4 flex flex-col gap-2 items-center aspect-3/2'>
				<Skeleton className='w-1/2 h-4' />
				<Skeleton className='w-full flex-1 flex items-center justify-center gap-2'>
					<TextShimmer text='Generating chart' />
				</Skeleton>
			</div>
		);
	}

	return <PlotlyIframe html={html} />;
};

function PlotlyIframe({ html }: { html: string }) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(450);

	const syncHeight = useCallback(() => {
		const doc = iframeRef.current?.contentDocument;
		if (!doc?.body) {
			return;
		}

		const contentHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
		if (contentHeight > 0) {
			setHeight(contentHeight);
		}
	}, []);

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) {
			return;
		}

		let observer: ResizeObserver | undefined;

		const handleLoad = () => {
			syncHeight();
			observer = new ResizeObserver(syncHeight);
			if (iframe.contentDocument?.body) {
				observer.observe(iframe.contentDocument.body);
			}
		};

		iframe.addEventListener('load', handleLoad);
		return () => {
			iframe.removeEventListener('load', handleLoad);
			observer?.disconnect();
		};
	}, [syncHeight]);

	const wrappedHtml = `<!DOCTYPE html>
<html><head>
<style>body{margin:0;padding:0;overflow:hidden;background:transparent;}</style>
</head><body>${html}</body></html>`;

	return (
		<div className='my-4 w-full border border-border'>
			<iframe
				ref={iframeRef}
				srcDoc={wrappedHtml}
				sandbox='allow-scripts'
				style={{ width: '100%', height: `${height}px`, border: 'none' }}
				title='Chart'
			/>
		</div>
	);
}
