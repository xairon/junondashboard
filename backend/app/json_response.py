from datetime import date
from decimal import Decimal
from typing import Any

import orjson
from starlette.responses import Response


def _default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, date):
        return obj.isoformat()
    raise TypeError


class FastJSONResponse(Response):
    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(content, default=_default)
