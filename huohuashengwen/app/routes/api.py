from typing import List, Dict, Any
from flask import Blueprint, request, jsonify
from ..prompts import (
    INIT_PROMPT_TMPL,
    STAGE_SUMMARY_TMPL,
    NEXT_CHOICES_TMPL,
    WORLDLINE_SUMMARY_TMPL,
    EXTRACT_KNOWN_TMPL,  # ← 新增
)
from ..services.gateway import call_model_json
from ..utils.parsing import ensure_choices

api_bp = Blueprint("api", __name__)

@api_bp.post("/initial")
def api_initial():
    data = request.get_json(force=True) or {}
    seed = (data.get("seed") or "").strip()
    provider = (data.get("provider") or "").strip().lower()

    if not seed:
        return jsonify({"ok": False, "error": "请输入已有信息/灵感"}), 400

    prompt = INIT_PROMPT_TMPL.substitute(seed=seed)
    payload = call_model_json(provider, prompt)
    if "error" in payload:
        return jsonify({"ok": False, "error": payload["error"], "raw": payload.get("raw")}), 500

    summary = payload.get("summary", "")
    choices, other = ensure_choices(payload)
    return jsonify({
        "ok": True,
        "type": payload.get("type", "start"),
        "summary": summary,
        "choices": choices,
        "other": other,
    })

@api_bp.post("/summarize_and_expand")
def api_summarize_and_expand():
    data = request.get_json(force=True) or {}
    history: List[str] = data.get("history") or []
    selected: str = (data.get("selected") or "").strip()
    prior_summary: str = (data.get("prior_summary") or "").strip()
    provider = (data.get("provider") or "").strip().lower()
    path: List[str] = data.get("path") or []

    if not selected:
        return jsonify({"ok": False, "error": "缺少被确认的选择内容"}), 400

    hist_text = "\n\n".join([str(x) for x in history if str(x).strip()])

    # 1) 阶段性总结（用于生成下一层）
    stage_prompt = STAGE_SUMMARY_TMPL.substitute(history=hist_text)
    stage_payload = call_model_json(provider, stage_prompt)
    if "error" in stage_payload:
        return jsonify({"ok": False, "error": stage_payload["error"], "raw": stage_payload.get("raw")}), 500
    stage_summary = stage_payload.get("stage_summary", "")

    # 2) 下一步走向
    prior_text = prior_summary if prior_summary else hist_text
    next_prompt = NEXT_CHOICES_TMPL.substitute(
        prior_summary=prior_text,
        stage_summary=stage_summary,
        selected=selected,
    )
    next_payload = call_model_json(provider, next_prompt)
    if "error" in next_payload:
        return jsonify({"ok": False, "error": next_payload["error"], "raw": next_payload.get("raw")}), 500
    next_choices, next_other = ensure_choices(next_payload)

    # 3) 世界线总结：根→当前路径
    ordered_list = path if path else (history + [selected])
    ordered_text = "\n".join([f"- {s}" for s in ordered_list if str(s).strip()])
    count = sum(1 for s in ordered_list if str(s).strip())

    worldline_prompt = WORLDLINE_SUMMARY_TMPL.substitute(
        ordered=ordered_text,
        count=count
    )
    worldline_payload = call_model_json(provider, worldline_prompt)
    if "error" in worldline_payload:
        return jsonify({"ok": False, "error": worldline_payload["error"], "raw": worldline_payload.get("raw")}), 500

    wl_known = worldline_payload.get("known", "")
    wl_progress = worldline_payload.get("progress", [])

    # 4) 已知信息结构化抽取（尽量填满）
    extract_prompt = EXTRACT_KNOWN_TMPL.substitute(
        known=wl_known,
        seed=history[0] if history else "",
        progress="\n".join([f"{i+1}. {p}" for i, p in enumerate(wl_progress)])
    )
    known_payload = call_model_json(provider, extract_prompt)
    if "error" in known_payload:
        return jsonify({"ok": False, "error": known_payload["error"], "raw": known_payload.get("raw")}), 500

    # 统一响应
    return jsonify({
        "ok": True,
        "stage_summary": stage_summary,
        "choices": next_choices,
        "other": next_other,
        "worldline": {
            "known": wl_known,
            "progress": wl_progress,   # ← 用这个给前端，避免首个分点缺失
        },
        "known_fields": known_payload  # ← 直接是按清单组织的 JSON
    })
