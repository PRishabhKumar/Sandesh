"""One error shape for the whole API.

Every failure leaves the server as::

    {"error": {"code": "not_a_member", "message": "You are not in this conversation"}}

The frontend therefore only needs one branch for error handling.
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """Raise this from services/routers instead of HTTPException."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


# --- Shortcuts for the errors we raise most often -------------------------
def not_found(message: str = "Resource not found", code: str = "not_found") -> ApiError:
    return ApiError(404, code, message)


def forbidden(message: str = "You are not allowed to do that", code: str = "forbidden") -> ApiError:
    return ApiError(403, code, message)


def bad_request(message: str, code: str = "bad_request") -> ApiError:
    return ApiError(400, code, message)


def unauthorized(message: str = "Not authenticated", code: str = "unauthorized") -> ApiError:
    return ApiError(401, code, message)


def conflict(message: str, code: str = "conflict") -> ApiError:
    return ApiError(409, code, message)


async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


async def validation_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Pydantic validation failures in the same envelope (422)."""
    errors = getattr(exc, "errors", lambda: [])()
    first = errors[0] if errors else {}
    field = ".".join(str(part) for part in first.get("loc", [])[1:]) or "body"
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": f"{field}: {first.get('msg', 'invalid request')}",
            }
        },
    )
