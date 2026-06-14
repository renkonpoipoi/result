from __future__ import annotations

import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory


ROOT = os.path.dirname(os.path.abspath(__file__))
SOURCE_BASE_URL = os.environ.get("SCORE_SOURCE_BASE_URL", "https://saiten.onrender.com").rstrip("/")

app = Flask(__name__, static_folder=None)


@app.get("/")
def home():
    return send_from_directory(ROOT, "result.html")


@app.get("/result")
def result_page():
    return send_from_directory(ROOT, "result.html")


@app.get("/api/result/summary")
def result_summary():
    query = {}
    project_id = request.args.get("projectId", "").strip()
    if project_id:
        query["projectId"] = project_id
    url = f"{SOURCE_BASE_URL}/api/result/summary"
    if query:
        url = f"{url}?{urlencode(query)}"

    try:
        source_request = Request(url, headers={"Accept": "application/json"})
        with urlopen(source_request, timeout=12) as response:
            body = response.read()
            status = response.status
    except HTTPError as exc:
        return jsonify({"error": f"採点アプリから結果を取得できませんでした。HTTP {exc.code}"}), exc.code
    except URLError:
        return jsonify({"error": "採点アプリに接続できませんでした。"}), 502
    except TimeoutError:
        return jsonify({"error": "採点アプリへの接続がタイムアウトしました。"}), 504

    return app.response_class(body, status=status, content_type="application/json; charset=utf-8")


@app.get("/<path:filename>")
def static_files(filename: str):
    if filename.startswith("assets/") or filename.endswith((".css", ".js", ".html", ".png", ".webp", ".wav", ".m4a")):
        return send_from_directory(ROOT, filename)
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8766"))
    app.run(host="0.0.0.0", port=port)
