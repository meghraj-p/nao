import asyncio
import math
import os
import re
import statistics
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

cli_path = Path(__file__).resolve().parent.parent.parent.parent / "cli"
sys.path.insert(0, str(cli_path))

from nao_core.config import NaoConfig, NaoConfigError
from nao_core.context import get_context_provider

port = int(os.environ.get("PORT", 8005))

# Global scheduler instance
scheduler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - setup scheduler on startup."""
    global scheduler

    # Setup periodic refresh if configured
    refresh_schedule = os.environ.get("NAO_REFRESH_SCHEDULE")
    if refresh_schedule:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = AsyncIOScheduler()

        try:
            trigger = CronTrigger.from_crontab(refresh_schedule)
            scheduler.add_job(
                _refresh_context_task,
                trigger,
                id="context_refresh",
                name="Periodic context refresh",
            )
            scheduler.start()
            print(f"[Scheduler] Periodic refresh enabled: {refresh_schedule}")
        except ValueError as e:
            print(f"[Scheduler] Invalid cron expression '{refresh_schedule}': {e}")

    yield

    # Shutdown scheduler
    if scheduler:
        scheduler.shutdown(wait=False)


async def _refresh_context_task():
    """Background task for scheduled context refresh."""
    try:
        provider = get_context_provider()
        updated = provider.refresh()
        if updated:
            print(f"[Scheduler] Context refreshed at {datetime.now().isoformat()}")
        else:
            print(
                f"[Scheduler] Context already up-to-date at {datetime.now().isoformat()}"
            )
    except Exception as e:
        print(f"[Scheduler] Failed to refresh context: {e}")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Request/Response Models
# =============================================================================


class ExecuteSQLRequest(BaseModel):
    sql: str
    nao_project_folder: str
    database_id: str | None = None
    env_vars: dict[str, str] | None = None


class ExecuteSQLResponse(BaseModel):
    data: list[dict]
    row_count: int
    columns: list[str]
    dialect: str | None = None


class RefreshResponse(BaseModel):
    status: str
    updated: bool
    message: str


class ExecuteChartPythonRequest(BaseModel):
    python_code: str
    data: list[dict]


class ExecuteChartPythonResponse(BaseModel):
    html: str
    computed_values: dict[str, str] = {}


class RenderChartPngRequest(BaseModel):
    python_code: str
    data: list[dict]
    width: int = 800
    height: int = 500


class HealthResponse(BaseModel):
    status: str
    context_source: str
    context_initialized: bool
    refresh_schedule: str | None


BLOCKED_IMPORT_PATTERN = re.compile(
    r"\b(?:import|from)\s+(?:os|sys|subprocess|shutil|glob|tempfile|pickle|socket|http|urllib|requests|pathlib)\b"
)
BLOCKED_BUILTIN_PATTERN = re.compile(
    r"\b(?:__import__|exec|eval|compile|open|getattr|setattr|delattr)\s*\("
)
CHART_EXEC_TIMEOUT_SECS = 30
_chart_executor = ThreadPoolExecutor(max_workers=4)

SAFE_BUILTINS = {
    name: __builtins__[name] if isinstance(__builtins__, dict) else getattr(__builtins__, name)
    for name in [
        "abs", "all", "any", "bin", "bool", "bytes", "callable", "chr", "complex",
        "dict", "dir", "divmod", "enumerate", "filter", "float", "format", "frozenset",
        "hash", "hex", "id", "int", "isinstance", "issubclass", "iter", "len", "list",
        "map", "max", "min", "next", "oct", "ord", "pow", "print", "property", "range",
        "repr", "reversed", "round", "set", "slice", "sorted", "str", "sum", "super",
        "tuple", "type", "zip", "True", "False", "None",
        "ValueError", "TypeError", "KeyError", "IndexError", "AttributeError",
        "RuntimeError", "StopIteration", "ZeroDivisionError", "Exception",
    ]
    if (isinstance(__builtins__, dict) and name in __builtins__)
    or (not isinstance(__builtins__, dict) and hasattr(__builtins__, name))
}


def _validate_chart_code(code: str) -> str | None:
    """Returns an error message if the code contains blocked patterns, None if safe."""
    if BLOCKED_IMPORT_PATTERN.search(code):
        match = BLOCKED_IMPORT_PATTERN.search(code)
        return f"Blocked import detected: '{match.group()}'. Only pandas, numpy, plotly, math, datetime, and statistics are allowed."
    if BLOCKED_BUILTIN_PATTERN.search(code):
        match = BLOCKED_BUILTIN_PATTERN.search(code)
        return f"Blocked builtin detected: '{match.group()}'. Direct use of __import__, exec, eval, compile, open, getattr, setattr, delattr is not allowed."
    return None


_NAMESPACE_BUILTINS = frozenset({
    "__builtins__", "df", "pd", "np", "px", "go", "fig",
    "math", "datetime", "date", "statistics",
})
_MAX_SCALARS = 50
_MAX_SCALAR_VALUE_LEN = 200


def _extract_scalars(namespace: dict) -> dict[str, str]:
    """Collect user-defined scalar variables from the sandbox namespace."""
    scalars: dict[str, str] = {}
    for key, value in namespace.items():
        if key.startswith("_") or key in _NAMESPACE_BUILTINS:
            continue
        if not isinstance(value, (int, float, str, bool, np.integer, np.floating)):
            continue
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            continue
        text = str(value)
        if len(text) > _MAX_SCALAR_VALUE_LEN:
            text = text[:_MAX_SCALAR_VALUE_LEN] + "…"
        scalars[key] = text
        if len(scalars) >= _MAX_SCALARS:
            break
    return scalars


def _convert_value(v: object):
    """Convert a DataFrame cell to a JSON-serializable Python type."""
    if v is None:
        return None

    # Handle float NaN / Infinity early (common in pandas output)
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None

    # Handle pandas NA / NaT sentinels
    if v is pd.NA or v is pd.NaT:
        return None

    # Numpy scalar types
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        val = float(v)
        return None if math.isnan(val) or math.isinf(val) else val
    if isinstance(v, np.ndarray):
        return v.tolist()

    # Python / DB types that aren't JSON-serializable by default
    if isinstance(v, Decimal):
        if v.is_nan() or v.is_infinite():
            return None
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace")

    # Catch-all for remaining numpy scalars (e.g. np.str_, np.bytes_)
    item_method = getattr(v, "item", None)
    if callable(item_method):
        return item_method()

    return v


# =============================================================================
# API Endpoints
# =============================================================================


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with context status."""
    try:
        provider = get_context_provider()
        context_source = os.environ.get("NAO_CONTEXT_SOURCE", "local")
        return HealthResponse(
            status="ok",
            context_source=context_source,
            context_initialized=provider.is_initialized(),
            refresh_schedule=os.environ.get("NAO_REFRESH_SCHEDULE"),
        )
    except Exception:
        return HealthResponse(
            status="error",
            context_source=os.environ.get("NAO_CONTEXT_SOURCE", "local"),
            context_initialized=False,
            refresh_schedule=os.environ.get("NAO_REFRESH_SCHEDULE"),
        )


@app.post("/api/refresh", response_model=RefreshResponse)
async def refresh_context():
    """Trigger a context refresh (git pull if using git source).

    This endpoint can be called by:
    - CI/CD pipelines after pushing new context
    - Webhooks when data schemas change
    - Manual triggers for immediate updates
    """
    try:
        provider = get_context_provider()
        updated = provider.refresh()

        if updated:
            return RefreshResponse(
                status="ok",
                updated=True,
                message="Context updated successfully",
            )
        else:
            return RefreshResponse(
                status="ok",
                updated=False,
                message="Context already up-to-date",
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh context: {str(e)}",
        )


@app.post("/execute_sql", response_model=ExecuteSQLResponse)
async def execute_sql(request: ExecuteSQLRequest):
    try:
        project_path = Path(request.nao_project_folder)
        config = NaoConfig.try_load(
            project_path,
            raise_on_error=True,
            extra_env=request.env_vars,
        )
        assert config is not None

        if len(config.databases) == 0:
            raise HTTPException(
                status_code=400,
                detail="No databases configured in nao_config.yaml",
            )

        if len(config.databases) == 1:
            db_config = config.databases[0]
        elif request.database_id:
            db_config = next(
                (db for db in config.databases if db.name == request.database_id),
                None,
            )
            if db_config is None:
                available_databases = [db.name for db in config.databases]
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": f"Database '{request.database_id}' not found",
                        "available_databases": available_databases,
                    },
                )
        else:
            available_databases = [db.name for db in config.databases]
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Multiple databases configured. Please specify database_id.",
                    "available_databases": available_databases,
                },
            )

        df = db_config.execute_sql(request.sql)

        data = [
            {k: _convert_value(v) for k, v in row.items()}
            for row in df.to_dict(orient="records")
        ]

        return ExecuteSQLResponse(
            data=data,
            row_count=len(data),
            columns=[str(c) for c in df.columns.tolist()],
            dialect=db_config.type,
        )
    except HTTPException:
        raise
    except NaoConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _build_chart_figure(python_code: str, data: list[dict]) -> tuple["go.Figure", dict]:
    validation_error = _validate_chart_code(python_code)
    if validation_error:
        raise HTTPException(status_code=400, detail=validation_error)

    df = pd.DataFrame(data)
    namespace = {
        "__builtins__": SAFE_BUILTINS,
        "df": df,
        "pd": pd,
        "np": np,
        "px": px,
        "go": go,
        "math": math,
        "datetime": datetime,
        "date": date,
        "statistics": statistics,
    }

    def _run_code():
        exec(python_code, namespace)

    try:
        loop = asyncio.get_running_loop()
        await asyncio.wait_for(
            loop.run_in_executor(_chart_executor, _run_code),
            timeout=CHART_EXEC_TIMEOUT_SECS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=400,
            detail=f"Chart code execution timed out after {CHART_EXEC_TIMEOUT_SECS} seconds.",
        )
    except Exception:
        raise HTTPException(status_code=400, detail=traceback.format_exc())

    fig = namespace.get("fig")
    if fig is None:
        raise HTTPException(
            status_code=400,
            detail="Code must assign a plotly Figure to a variable named `fig`.",
        )
    if not isinstance(fig, go.Figure):
        raise HTTPException(
            status_code=400,
            detail=f"Variable `fig` must be a plotly Figure, got {type(fig).__name__}.",
        )

    return fig, namespace


@app.post("/execute_chart_python", response_model=ExecuteChartPythonResponse)
async def execute_chart_python(request: ExecuteChartPythonRequest):
    fig, namespace = await _build_chart_figure(request.python_code, request.data)

    try:
        html = fig.to_html(full_html=False, include_plotlyjs="cdn")
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to convert figure to HTML: {traceback.format_exc()}",
        )

    computed_values = _extract_scalars(namespace)
    return ExecuteChartPythonResponse(html=html, computed_values=computed_values)


@app.post("/render_chart_png")
async def render_chart_png(request: RenderChartPngRequest):
    fig, _ = await _build_chart_figure(request.python_code, request.data)

    try:
        loop = asyncio.get_running_loop()
        png_bytes = await loop.run_in_executor(
            _chart_executor,
            lambda: fig.to_image(format="png", width=request.width, height=request.height),
        )
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to render figure as PNG: {traceback.format_exc()}",
        )

    return Response(content=png_bytes, media_type="image/png")


if __name__ == "__main__":
    nao_project_folder = os.getenv("NAO_DEFAULT_PROJECT_PATH")
    if nao_project_folder:
        project_path = Path(nao_project_folder)
        if not project_path.is_absolute():
            repo_root = cli_path.parent
            project_path = (repo_root / nao_project_folder).resolve()
        else:
            project_path = project_path.resolve()
        if not project_path.exists():
            raise FileNotFoundError(
                f"NAO_DEFAULT_PROJECT_PATH does not exist: {project_path}\n"
                f"Set NAO_DEFAULT_PROJECT_PATH in .env to an absolute path or a path relative to the repo root ({cli_path.parent})"
            )
        os.chdir(project_path)

    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
