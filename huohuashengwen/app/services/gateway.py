"""
统一模型网关：根据 provider 分发到 gemini / deepseek
- 不再有强制覆盖，前端传哪个就用哪个
"""
from typing import Optional
from flask import current_app
from .gemini import call_gemini_json
from .deepseek import call_deepseek_json

_VALID = {"gemini", "deepseek"}

def _normalize_provider(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    p = str(p).strip().lower()
    return p if p in _VALID else None

def call_model_json(provider: Optional[str], prompt: str):
    # 优先用请求传入的 provider，否则用 config 里的 DEFAULT_PROVIDER
    req = _normalize_provider(provider)
    cfg = _normalize_provider(current_app.config.get("DEFAULT_PROVIDER"))
    prov = req or cfg or "deepseek"

    print(
        f"[gateway] route -> provider={prov} "
        f"(requested={provider!r}, default={current_app.config.get('DEFAULT_PROVIDER')!r})"
    )

    if prov == "deepseek":
        return call_deepseek_json(prompt)
    else:
        return call_gemini_json(prompt)
