"""
DeepSeek 服务封装（兼容 openai v1.x 和 v0.x 调用方式）

- 优先使用 openai>=1.x 的 `OpenAI` 客户端；
- 若本机还是旧版 openai（没有 OpenAI 类），自动退回到 v0 接口；
- 初始化时打印一次自检信息（掩码后的 key / base_url / model）；
- 发生错误时，将 HTTP 状态码与返回体片段透传，便于定位像
  “Authentication Fails (governor)” 这类问题。
"""
from typing import Any, Dict, Optional
from flask import current_app
from ..utils.parsing import extract_json

# -------- 兼容导入：优先新 SDK，失败再用旧 SDK ----------
_OPENAI_V1 = True
try:
    from openai import OpenAI  # type: ignore
except Exception:
    _OPENAI_V1 = False
    import openai  # type: ignore


def _mask(s: str, left: int = 4, right: int = 4) -> str:
    if not s:
        return ""
    if len(s) <= left + right:
        return "*" * len(s)
    return s[:left] + "*" * (len(s) - left - right) + s[-right:]


def init_deepseek(app):
    """
    初始化 DeepSeek 客户端（OpenAI 兼容）。把客户端对象存到 app.extensions。
    """
    api_key = app.config.get("DEEPSEEK_API_KEY", "")
    base_url = app.config.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    model = app.config.get("DEEPSEEK_MODEL", "deepseek-chat")

    # 自检打印（一次性；不打印完整 key）
    print(
        f"[DeepSeek] init: base_url={base_url}, model={model}, "
        f"api_key(masked)={_mask(api_key)} , openai_v1={_OPENAI_V1}"
    )

    if _OPENAI_V1:
        # openai >= 1.x
        try:
            client = OpenAI(api_key=api_key, base_url=base_url)
            app.extensions["deepseek_client"] = client
        except Exception as e:
            print("[DeepSeek] OpenAI v1 client init failed:", e)
            app.extensions["deepseek_client"] = None
    else:
        # openai 旧版：用全局变量配置
        openai.api_key = api_key
        openai.api_base = base_url
        app.extensions["deepseek_client"] = "v0"  # 仅作标记


def _call_v1(prompt: str) -> Dict[str, Any]:
    client = current_app.extensions.get("deepseek_client")
    if client is None:
        return {"error": "DeepSeek client not initialized (v1)"}

    model_name = current_app.config.get("DEEPSEEK_MODEL", "deepseek-chat")
    temperature = float(current_app.config.get("DEEPSEEK_TEMPERATURE", 0.8))
    max_tokens = int(current_app.config.get("DEEPSEEK_MAX_TOKENS", 2048))

    sys_hint = (
        "你是一个严格的 JSON 生成器。无论输入如何，你都只输出严格的 JSON，"
        "不要包含解释、Markdown、XML 或额外字符。"
    )
    try:
        # 部分兼容服务不支持 response_format；如果报错会走 except 分支再 retry 一次
        try:
            resp = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": sys_hint},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        except Exception:
            # 去掉 response_format 再试一次
            resp = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": sys_hint},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )

        text = resp.choices[0].message.content if resp and resp.choices else ""
        payload = extract_json(text)
        return payload if payload else {"raw": text}
    except Exception as e:
        # 尝试从 e 中拿到更具体的 http 状态码和返回体
        err_msg = str(e)
        try:
            # 新版 openai 异常里常带有 response.status_code / response.text
            status = getattr(getattr(e, "response", None), "status_code", None)
            body = getattr(getattr(e, "response", None), "text", None)
            if body and isinstance(body, bytes):
                body = body.decode("utf-8", "ignore")
            if status or body:
                err_msg = f"{err_msg} | http_status={status} | body_snippet={str(body)[:300]}"
        except Exception:
            pass
        return {"error": err_msg}


def _call_v0(prompt: str) -> Dict[str, Any]:
    model_name = current_app.config.get("DEEPSEEK_MODEL", "deepseek-chat")
    temperature = float(current_app.config.get("DEEPSEEK_TEMPERATURE", 0.8))
    max_tokens = int(current_app.config.get("DEEPSEEK_MAX_TOKENS", 2048))

    sys_hint = (
        "你是一个严格的 JSON 生成器。无论输入如何，你都只输出严格的 JSON，"
        "不要包含解释、Markdown、XML 或额外字符。"
    )
    try:
        # 旧版 openai 接口
        resp = openai.ChatCompletion.create(  # type: ignore
            model=model_name,
            messages=[
                {"role": "system", "content": sys_hint},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        # 旧版 message 结构略有不同
        msg = resp["choices"][0]["message"]
        text = msg.get("content", "") if isinstance(msg, dict) else ""
        payload = extract_json(text)
        return payload if payload else {"raw": text}
    except Exception as e:
        # 旧版也尽量带上 status/返回体信息
        err_msg = str(e)
        try:
            status = getattr(getattr(e, "http_status", None), "status_code", None) or getattr(e, "http_status", None)
            body = getattr(e, "http_body", None)
            if body and isinstance(body, bytes):
                body = body.decode("utf-8", "ignore")
            if status or body:
                err_msg = f"{err_msg} | http_status={status} | body_snippet={str(body)[:300]}"
        except Exception:
            pass
        return {"error": err_msg}


def call_deepseek_json(prompt: str) -> Dict[str, Any]:
    """
    统一对外入口：自动选择 v1 或 v0 调用。
    """
    if _OPENAI_V1:
        return _call_v1(prompt)
    return _call_v0(prompt)
