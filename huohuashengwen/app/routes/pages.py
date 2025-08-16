from flask import Blueprint, render_template, current_app

pages_bp = Blueprint("pages", __name__)

@pages_bp.get("/")
def index():
    return render_template(
        "index.html",
        project_name=current_app.config.get("PROJECT_NAME", "火花生文"),
        tagline=current_app.config.get("TAGLINE", "你只需要创意和决策，内容交给火花"),
    )
