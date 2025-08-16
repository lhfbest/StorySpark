from flask import Flask, jsonify, request
from .config import Config
from .routes.pages import pages_bp
from .routes.api import api_bp
from .services.gemini import init_gemini
from .services.deepseek import init_deepseek  # 新增导入

def create_app(config_object=None):
    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )
    app.config.from_object(config_object or Config)

    # 初始化两类模型客户端
    init_gemini(app)
    init_deepseek(app)  # 新增

    # 注册蓝图
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    # —— API 统一错误 JSON 化（仅对 /api/*）
    @app.errorhandler(400)
    def _400(e):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": str(e)}), 400
        return e

    @app.errorhandler(404)
    def _404(e):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Not Found"}), 404
        return e

    @app.errorhandler(500)
    def _500(e):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Server Error"}), 500
        return e

    return app
