from pathlib import Path
from uuid import uuid4

from backend.app.ingest import validate
from backend.app.nlp import clean, lexical_prediction

def account(client):
    body = {"email": f"test-{uuid4().hex}@example.com", "password": "correct horse staple"}
    created = client.post("/api/auth/register", json=body)
    assert created.status_code == 201, created.text
    return body, {"Authorization": "Bearer " + created.json()["access_token"]}

def test_validation_and_negation():
    headers = ["Review", "Stars", "Item", "Department", "Verified", "Date"]
    data = [
        dict(zip(headers, ["Great", 5, "One", "Home", False, "2025-05-04"])),
        dict(zip(headers, ["<i>Great</i>", 4, "One", "Home", "true", "2025-05-04"])),
        dict(zip(headers, ["", 9, "One", "Home", "unknown", "2025-02-30"])),
    ]
    mapping, rows, quality = validate(headers, data)
    assert mapping["rating"] == "Stars"
    assert rows[0]["verified_purchase"] is False
    assert [quality[key] for key in ("valid", "duplicates", "invalid_ratings", "invalid_booleans", "invalid_dates", "missing_values")] == [1, 1, 1, 1, 1, 1]
    assert clean("<p>Wasn't  GREAT!</p>") == "was not great"
    assert lexical_prediction("not great")["sentiment"] == "negative"

def test_accounts_import_ownership_and_exports(client):
    body, headers = account(client)
    assert client.post("/api/auth/register", json=body).status_code == 409
    assert client.post("/api/auth/login", json={**body, "password": "incorrect password"}).status_code == 401
    assert client.post("/api/auth/login", json=body).status_code == 200
    assert client.get("/api/auth/me", headers=headers).json()["email"] == body["email"]
    assert client.get("/api/auth/me").status_code == 401
    csv = b"text,stars,item,category,verified\nGreat sound,5,Alpha,Electronics,true\nVery slow,1,Beta,Electronics,false\nGreat sound,5,Alpha,Electronics,true\nMissing rating,,Beta,Electronics,false\n"
    file = {"file": ("my-reviews.csv", csv)}
    assert client.post("/api/datasets/upload", files=file).status_code == 403
    preview = client.post("/api/datasets/upload", files=file, headers=headers).json()
    assert preview["quality"]["valid"] == 2
    assert preview["quality"]["invalid"] == 2
    response = client.post("/api/datasets/upload", files=file, data={"confirm": "true"}, headers=headers)
    assert response.status_code == 200, response.text
    dataset = response.json()["dataset"]["id"]
    params = {"dataset": dataset}
    assert client.get(f"/api/datasets/{dataset}").status_code == 404
    _, other = account(client)
    assert client.get(f"/api/datasets/{dataset}", headers=other).status_code == 404
    overview = client.get("/api/analytics/overview", params=params, headers=headers).json()["metrics"]
    assert (overview["total"], overview["positive"], overview["negative"], overview["rating"]) == (2, 1, 1, 3)
    filtered = client.get("/api/reviews", params={**params, "verified": False, "search": "slow"}, headers=headers).json()
    assert filtered["total"] == 1 and filtered["items"][0]["product"] == "Beta"
    assert client.get("/api/analytics/segments", params={**params, "dimension": "store"}, headers=headers).json() == []
    assert client.get(f"/api/datasets/{dataset}/download", headers=headers).content.startswith(b"\xef\xbb\xbf")
    for fmt, signature in [("xlsx", b"PK"), ("pdf", b"%PDF")]:
        report = client.get("/api/reports/export", params={**params, "format": fmt}, headers=headers)
        assert report.status_code == 200 and report.content.startswith(signature)
    assert client.post("/api/ml/train", params=params, headers=headers).status_code == 422
    assert client.delete(f"/api/datasets/{dataset}", headers=other).status_code == 404
    assert client.delete(f"/api/datasets/{dataset}", headers=headers).status_code == 204
    assert client.get(f"/api/datasets/{dataset}", headers=headers).status_code == 404

def test_demo_analytics_topics_and_model(client):
    assert client.get("/api/health").json()["status"] == "ok"
    demo = client.get("/api/datasets").json()[0]
    assert demo["is_demo"] and demo["rows"] == 448
    report = client.get("/api/ml/evaluate").json()
    assert len(report["comparison"]) == 3
    assert sum(map(sum, report["matrix"])) == report["holdout_rows"]
    assert set(report["dimensions"]) == {"product", "store", "customer_segment", "review_period"}
    prediction = client.post("/api/reviews/predict", json={"text": "The battery failed and the package arrived damaged."}).json()
    assert prediction["sentiment"] == "negative"
    assert abs(sum(prediction["probabilities"].values()) - 1) < 1e-6
    topics = client.get("/api/topics").json()
    assert len(topics) > 1 and topics[0]["reviews"]
    assert client.get(f"/api/topics/{topics[0]['id']}/reviews").json()
    assert client.get("/api/recommendations").json()
    assert client.get("/api/analytics/trends", params={"period": "week"}).json()

def test_train_private_model_and_reload(client):
    _, headers = account(client)
    sample = Path("data/sample/reviews.csv").read_bytes()
    result = client.post("/api/datasets/upload", headers=headers, files={"file": ("sample.csv", sample)}, data={"confirm": "true"})
    assert result.status_code == 200, result.text
    dataset = result.json()["dataset"]["id"]
    params = {"dataset": dataset}
    queued = client.post("/api/ml/train", params=params, headers=headers)
    assert queued.status_code == 202, queued.text
    versions = client.get("/api/ml/models", params=params, headers=headers).json()
    assert versions[0]["status"] == "ready", versions
    prediction = client.post("/api/reviews/predict", params=params, headers=headers, json={"text": "Poor quality and a broken zipper."}).json()
    assert prediction["model_version"] == f"model-{versions[0]['id']}"
    assert client.get("/api/ml/evaluate", params=params, headers=headers).json()["holdout_rows"] > 0
