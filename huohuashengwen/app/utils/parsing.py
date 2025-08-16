import re
import json
from typing import Any, Dict, List, Tuple

JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")
FENCE_RE = re.compile(r"```(?:json)?\n([\s\S]+?)\n```", re.IGNORECASE)

def extract_json(text: str) -> Dict[str, Any]:
    """
    尽力把模型输出转为 JSON。失败则返回 {"raw": 原文}，便于排错。
    """
    if not text:
        return {"raw": text}

    # 1) 直接解析
    try:
        return json.loads(text)
    except Exception:
        pass

    # 2) 代码块 ```json ... ```
    m = FENCE_RE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass

    # 3) 从第一段花括号中解析
    m = JSON_BLOCK_RE.search(text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass

    return {"raw": text}

def ensure_choices(payload: Dict[str, Any]) -> Tuple[List[str], str]:
    """
    从 JSON 中拿到 [choices(3), other]，并对缺项进行兜底。
    """
    choices = payload.get("choices") or []
    if not isinstance(choices, list):
        choices = []
    choices = [str(x).strip() for x in choices][:3]
    other = payload.get("other")
    other = str(other).strip() if other else "其他选择"
    while len(choices) < 3:
        choices.append(f"待补充选项{len(choices)+1}")
    return choices, other
