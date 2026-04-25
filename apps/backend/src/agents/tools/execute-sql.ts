import type { executeSql } from '@nao/shared/tools';
import { executeSql as schemas } from '@nao/shared/tools';

import { ExecuteSqlOutput, renderToModelOutput } from '../../components/tool-outputs';
import { env } from '../../env';
import { ToolContext } from '../../types/tools';
import { isReadOnlySqlQuery } from '../../utils/sql-filter';
import { createTool } from '../../utils/tools';

const MAX_CACHED_QUERIES = 50;
const CACHE_TTL_MS = 15 * 60 * 1000;

type CachedQuery = { data: Record<string, unknown>[]; columns: string[]; cachedAt: number };
const queryResultCache = new Map<string, CachedQuery>();

export function getQueryResult(queryId: string): { data: Record<string, unknown>[]; columns: string[] } | undefined {
	const entry = queryResultCache.get(queryId);
	if (!entry) {
		return undefined;
	}
	if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
		queryResultCache.delete(queryId);
		return undefined;
	}
	return entry;
}

function cacheQueryResult(queryId: string, data: Record<string, unknown>[], columns: string[]): void {
	evictExpiredEntries();
	if (queryResultCache.size >= MAX_CACHED_QUERIES) {
		const oldest = queryResultCache.keys().next().value!;
		queryResultCache.delete(oldest);
	}
	queryResultCache.set(queryId, { data, columns, cachedAt: Date.now() });
}

function evictExpiredEntries(): void {
	const now = Date.now();
	for (const [key, entry] of queryResultCache) {
		if (now - entry.cachedAt > CACHE_TTL_MS) {
			queryResultCache.delete(key);
		}
	}
}

export async function executeQuery(
	{ sql_query, database_id }: executeSql.Input,
	context: ToolContext,
): Promise<executeSql.Output> {
	const naoProjectFolder = context.projectFolder;

	const writePermEnabled = context.agentSettings?.sql?.dangerouslyWritePermEnabled ?? false;
	if (!writePermEnabled && !(await isReadOnlySqlQuery(sql_query))) {
		throw new Error(
			'Write SQL operations are disabled. Only SELECT queries are allowed. ' +
				'Enable "Dangerous write permissions" in the admin panel to allow INSERT, UPDATE, DELETE and DDL queries.',
		);
	}

	const envVars = context.envVars;
	const response = await fetch(`http://localhost:${env.FASTAPI_PORT}/execute_sql`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			sql: sql_query,
			nao_project_folder: naoProjectFolder,
			...(database_id && { database_id }),
			...(Object.keys(envVars).length > 0 && { env_vars: envVars }),
		}),
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ detail: response.statusText }));
		throw new Error(`Error executing SQL query: ${JSON.stringify(errorData.detail)}`);
	}

	const result = await response.json();
	const queryId = `query_${crypto.randomUUID().slice(0, 8)}`;
	cacheQueryResult(queryId, result.data, result.columns);

	return {
		_version: '1',
		...result,
		id: queryId,
	};
}

export default createTool<executeSql.Input, executeSql.Output>({
	description:
		'Execute a SQL query against the connected database and return the results. If multiple databases are configured, specify the database_id. Output includes: id (query_xxx, use in display_chart query_id), data (array of rows as key-value objects), columns (column names), row_count.',
	inputSchema: schemas.InputSchema,
	outputSchema: schemas.OutputSchema,
	execute: executeQuery,
	toModelOutput: ({ output }) => renderToModelOutput(ExecuteSqlOutput({ output }), output),
});
