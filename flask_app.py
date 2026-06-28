from __future__ import annotations

import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory


ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SOURCE_BASE_URL = "https://saiten.onrender.com"


def source_base_url() -> str:
    configured = (
        os.environ.get("SCORE_SOURCE_BASE_URL")
        or os.environ.get("SAITEN_BASE_URL")
        or DEFAULT_SOURCE_BASE_URL
    )
    return configured.strip().rstrip("/")


app = Flask(__name__, static_folder=None)


@app.get("/")
def home():
    return send_from_directory(ROOT, "result.html")


@app.get("/result")
def result_page():
    return send_from_directory(ROOT, "result.html")


@app.get("/api/projects")
def projects():
    return proxy_json("/api/projects")


@app.get("/api/result/summary")
def result_summary():
    query = {}
    project_id = request.args.get("projectId", "").strip()
    if project_id:
        query["projectId"] = project_id
    return proxy_json("/api/result/summary", query)


@app.get("/api/source")
def source_status():
    response, status = proxy_json("/api/projects", as_tuple=True)
    payload = response.get_json(silent=True) or {}
    return jsonify(
        {
            "sourceBaseUrl": source_base_url(),
            "ok": status == 200 and "projects" in payload,
            "status": status,
            "projectCount": len(payload.get("projects", [])) if isinstance(payload.get("projects"), list) else 0,
            "error": payload.get("error"),
        }
    ), 200 if status == 200 else status


def proxy_json(path: str, query: dict | None = None, as_tuple: bool = False):
    url = f"{source_base_url()}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    try:
        source_request = Request(url, headers={"Accept": "application/json"})
        with urlopen(source_request, timeout=12) as response:
            body = response.read()
            status = response.status
            proxied = app.response_class(body, status=status, content_type="application/json; charset=utf-8")
    except HTTPError as exc:
        proxied = jsonify(
            {
                "error": f"採点アプリから結果を取得できませんでした。HTTP {exc.code}",
                "sourceBaseUrl": source_base_url(),
            }
        )
        status = exc.code
    except TimeoutError:
        proxied = jsonify(
            {
                "error": "採点アプリへの接続がタイムアウトしました。",
                "sourceBaseUrl": source_base_url(),
            }
        )
        status = 504
    except URLError:
        proxied = jsonify(
            {
                "error": "採点アプリに接続できませんでした。SCORE_SOURCE_BASE_URL を確認してください。",
                "sourceBaseUrl": source_base_url(),
            }
        )
        status = 502

    proxied.headers["Cache-Control"] = "no-store"
    if as_tuple:
        return proxied, status
    return proxied, status


@app.get("/<path:filename>")
def static_files(filename: str):
    if filename.startswith("assets/") or filename.endswith((".css", ".js", ".html", ".png", ".webp", ".wav", ".m4a")):
        return send_from_directory(ROOT, filename)
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8766"))
    app.run(host="0.0.0.0", port=port)
