import { AlertCircleIcon } from 'lucide-react';

import { useAgentContext } from '@/contexts/agent.provider';
import { parseBudgetError } from '@/lib/ai';
import { cn } from '@/lib/utils';

export interface Props {
	className?: string;
}

type ParsedError = {
	error?: string;
	message?: string;
};

function extractString(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value || undefined;
	}
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const msg = obj.message ?? obj.msg ?? obj.error;
		if (typeof msg === 'string') {
			return msg || undefined;
		}
	}
	return undefined;
}

function parseError(error: Error): ParsedError {
	try {
		const parsed = JSON.parse(error.message) as Record<string, unknown>;
		// Handle nested OpenAI-style errors: { type, error: { type, code, message, param } }
		const nestedError = parsed.error && typeof parsed.error === 'object' ? parsed.error : null;
		return {
			error: nestedError ? undefined : extractString(parsed.error),
			message: extractString(parsed.message) ?? extractString(nestedError) ?? extractString(parsed),
		};
	} catch {
		return { message: error.message };
	}
}

export function ChatError({ className }: Props) {
	const { error } = useAgentContext();

	if (!error || parseBudgetError(error)) {
		return null;
	}

	const parsed = parseError(error);

	return (
		<div className={cn('flex items-start gap-2.5 px-4 py-3 text-red-500', className)}>
			<AlertCircleIcon className='size-4 shrink-0 mt-1' />

			<div className='flex-1 min-w-0 text-sm wrap-break-word'>
				{parsed.error && <span className='font-medium'>{parsed.error}</span>}
				{parsed.message && <p className='text-red-400 mt leading-relaxed'>{parsed.message}</p>}
			</div>
		</div>
	);
}
