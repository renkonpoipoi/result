from __future__ import annotations

import json
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
    try:
        return jsonify(build_result_summary(request.args.get("projectId", "").strip()))
    except SourceRequestError as exc:
        return jsonify({"error": exc.message, "sourceBaseUrl": source_base_url()}), exc.status


@app.get("/api/source")
def source_status():
    try:
        payload = fetch_source_json("/api/projects")
        projects_payload = payload.get("projects", [])
        return jsonify(
            {
                "sourceBaseUrl": source_base_url(),
                "ok": isinstance(projects_payload, list),
                "status": 200,
                "projectCount": len(projects_payload) if isinstance(projects_payload, list) else 0,
                "error": None,
            }
        )
    except SourceRequestError as exc:
        return jsonify(
            {
                "sourceBaseUrl": source_base_url(),
                "ok": False,
                "status": exc.status,
                "projectCount": 0,
                "error": exc.message,
            }
        ), exc.status


def build_result_summary(project_id: str) -> dict:
    projects_payload = fetch_source_json("/api/projects")
    projects = projects_payload.get("projects", [])
    if not isinstance(projects, list) or not projects:
        raise SourceRequestError("採点プロジェクトが見つかりませんでした。", 404)

    selected_project_id = project_id or str(projects[0].get("id", ""))
    project = next((item for item in projects if item.get("id") == selected_project_id), None)
    if not project:
        raise SourceRequestError("指定された採点プロジェクトが見つかりませんでした。", 404)

    source_summary = fetch_source_json("/api/result/summary", {"projectId": selected_project_id})
    judges = source_summary.get("judges", [])
    submitted_judge_ids = {judge.get("id") for judge in judges if judge.get("submitted")}
    scores_by_judge = {}
    for judge in project.get("judges", []):
        judge_id = judge.get("id")
        if judge_id not in submitted_judge_ids:
            continue
        score_payload = fetch_source_json("/api/scores", {"projectId": selected_project_id, "judgeId": judge_id})
        scores_by_judge[judge_id] = score_payload.get("scores", {})

    team_results = []
    for team in project.get("teams", []):
        team_id = team.get("id")
        judge_totals = []
        for judge in project.get("judges", []):
            judge_id = judge.get("id")
            if judge_id not in submitted_judge_ids:
                continue
            total = scores_by_judge.get(judge_id, {}).get(team_id, {}).get("total", "")
            if isinstance(total, int):
                judge_totals.append({"judgeId": judge_id, "judgeName": judge.get("name", ""), "total": total})
        counted_judge_totals = reduce_to_nine_by_median_distance(judge_totals)
        team_total = sum(item["total"] for item in counted_judge_totals)
        team_results.append(
            {
                "id": team_id,
                "name": team.get("name", ""),
                "order": team.get("order", 0),
                "total": team_total,
                "average": round(team_total / len(counted_judge_totals), 2) if counted_judge_totals else 0,
                "judgeTotals": counted_judge_totals,
            }
        )
    team_results.sort(key=lambda item: (-item["total"], item["order"]))

    return {
        "project": {
            "id": project.get("id"),
            "name": project.get("name"),
            "status": project.get("status", "open"),
            "teams": project.get("teams", []),
            "judges": project.get("judges", []),
        },
        "judges": judges,
        "submittedCount": source_summary.get("submittedCount", len(submitted_judge_ids)),
        "totalJudges": source_summary.get("totalJudges", len(project.get("judges", []))),
        "allSubmitted": source_summary.get("allSubmitted", False),
        "teamResults": team_results,
    }


def reduce_to_nine_by_median_distance(judge_totals: list[dict]) -> list[dict]:
    if len(judge_totals) <= 9:
        return judge_totals
    median = median_total(judge_totals)
    remove_count = len(judge_totals) - 9
    indexed = [{**item, "_index": index} for index, item in enumerate(judge_totals)]
    remove_indexes = {
        item["_index"]
        for item in sorted(indexed, key=lambda item: (-abs(item["total"] - median), -item["total"], item["_index"]))[
            :remove_count
        ]
    }
    return [item for index, item in enumerate(judge_totals) if index not in remove_indexes]


def median_total(judge_totals: list[dict]) -> float:
    values = sorted(item["total"] for item in judge_totals)
    center = len(values) // 2
    if len(values) % 2:
        return float(values[center])
    return (values[center - 1] + values[center]) / 2


def fetch_source_json(path: str, query: dict | None = None) -> dict:
    url = f"{source_base_url()}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    try:
        source_request = Request(url, headers={"Accept": "application/json"})
        with urlopen(source_request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise SourceRequestError(f"採点アプリからデータを取得できませんでした。HTTP {exc.code}", exc.code) from exc
    except TimeoutError as exc:
        raise SourceRequestError("採点アプリへの接続がタイムアウトしました。", 504) from exc
    except (URLError, json.JSONDecodeError) as exc:
        raise SourceRequestError("採点アプリに接続できませんでした。SCORE_SOURCE_BASE_URL を確認してください。", 502) from exc


def proxy_json(path: str, query: dict | None = None, as_tuple: bool = False):
    try:
        payload = fetch_source_json(path, query)
        proxied = jsonify(payload)
        status = 200
    except SourceRequestError as exc:
        proxied = jsonify({"error": exc.message, "sourceBaseUrl": source_base_url()})
        status = exc.status

    proxied.headers["Cache-Control"] = "no-store"
    if as_tuple:
        return proxied, status
    return proxied, status


class SourceRequestError(Exception):
    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.message = message
        self.status = status


@app.get("/<path:filename>")
def static_files(filename: str):
    if filename.startswith("assets/") or filename.endswith((".css", ".js", ".html", ".png", ".webp", ".wav", ".m4a")):
        return send_from_directory(ROOT, filename)
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8766"))
    app.run(host="0.0.0.0", port=port)
