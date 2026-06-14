# Result Display App

採点アプリとは別に公開する、結果表示専用アプリです。

## Render設定

```text
Build Command: pip install -r requirements.txt
Start Command: gunicorn flask_app:app --bind 0.0.0.0:$PORT --workers 1
```

環境変数:

```text
SCORE_SOURCE_BASE_URL=https://saiten.onrender.com
```

`SCORE_SOURCE_BASE_URL` には、採点用アプリのRender URLを入れます。

## 表示URL

```text
https://結果表示アプリのURL/
https://結果表示アプリのURL/result
https://結果表示アプリのURL/result?project=m1-three-teams-2026
```
