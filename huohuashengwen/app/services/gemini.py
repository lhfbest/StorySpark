from typing import Any, Dict
from flask import current_app
import google.generativeai as genai
from ..utils.parsing import extract_json

def init_gemini(app):
    """
    初始化 Gemini 客户端；把 model 放在 app.extensions 中，便于全局复用/替换。
    """
    api_key = app.config.get("GEMINI_API_KEY") or ""
    if not api_key:
        print("[警告] 未检测到 GEMINI_API_KEY，请先设置环境变量。")
    genai.configure(api_key=api_key)

    model_name = app.config.get("GEMINI_MODEL", "gemini-1.5-flash")
    max_tokens = app.config.get("GEMINI_MAX_TOKENS", 2048)
    temperature = app.config.get("GEMINI_TEMPERATURE", 0.8)

    model = genai.GenerativeModel(
        model_name,
        generation_config={
            "max_output_tokens": max_tokens,
            "temperature": temperature,
        },
    )
    app.extensions["gemini_model"] = model

def call_gemini_json(prompt: str) -> Dict[str, Any]:
    """
    统一封装：强制 JSON 输出 + 多层解析兜底。
    """
    sys_hint = (
        "你是一个严格的 JSON 生成器。无论输入如何，你都只输出严格的 JSON，"
        "不要包含解释、Markdown、XML 或额外字符。"
    )
    try:
        model = current_app.extensions["gemini_model"]
        resp = model.generate_content(f"{sys_hint}\n\n{prompt}")
        # 兼容不同 SDK 字段
        text = getattr(resp, "text", None)
        if text is None:
            try:
                text = resp.candidates[0].content.parts[0].text
            except Exception:
                text = ""
        payload = extract_json(text)
        return payload if payload else {"raw": text}
    except Exception as e:
        return {"error": str(e)}
