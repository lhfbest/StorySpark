from app import create_app

# 自动加载 .env（项目根目录）
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

app = create_app()

if __name__ == "__main__":
    import os
    debug = os.getenv("DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug)
