# Result Display App

採点アプリとは別に公開する、結果発表専用アプリです。

## Render 設定

```text
Build Command: pip install -r requirements.txt
Start Command: gunicorn flask_app:app --bind 0.0.0.0:$PORT --workers 1
```

環境変数:

```text
SCORE_SOURCE_BASE_URL=https://saiten.onrender.com
```

`SCORE_SOURCE_BASE_URL` には、採点用アプリの Render URL を入れてください。末尾の `/` はあってもなくても動きます。

例:

```text
SCORE_SOURCE_BASE_URL=https://あなたの採点アプリ名.onrender.com
```

`SAITEN_BASE_URL` という名前でも指定できます。両方ある場合は `SCORE_SOURCE_BASE_URL` が優先されます。

## 表示 URL

```text
https://結果表示アプリのURL/
https://結果表示アプリのURL/result
https://結果表示アプリのURL/result?project=m1-three-teams-2026
```

## 連動確認

結果表示アプリ側で次の URL を開くと、どの採点アプリに接続しているか確認できます。

```text
https://結果表示アプリのURL/api/source
```

`ok` が `true` なら、採点アプリの `/api/projects` を読めています。`sourceBaseUrl` が意図した採点アプリの URL になっているか確認してください。
