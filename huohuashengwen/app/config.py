import os

class Config:
    PROJECT_NAME = "火花生文"
    TAGLINE = "你只需要创意和决策，内容交给火花"

    # 默认提供方（当请求没指定 provider 时才使用）
    DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "deepseek")

    # === Gemini ===
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    GEMINI_MAX_TOKENS = int(os.getenv("GEMINI_MAX_TOKENS", "2048"))
    GEMINI_TEMPERATURE = float(os.getenv("GEMINI_TEMPERATURE", "0.8"))

    # === DeepSeek（OpenAI 兼容）===
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "2048"))
    DEEPSEEK_TEMPERATURE = float(os.getenv("DEEPSEEK_TEMPERATURE", "0.8"))
