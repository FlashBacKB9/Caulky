"""Gemini model discovery: ranking, listing and replacing a retired model."""
import httpx
from sqlalchemy import select

from app.models.user_preference import UserPreference
from app.routers import tickets


def _models_payload(*ids, extra=None):
    models = [
        {"name": f"models/{i}", "displayName": i.replace("-", " ").title(),
         "supportedGenerationMethods": ["generateContent"]}
        for i in ids
    ]
    return {"models": models + (extra or [])}


def _mock_httpx(monkeypatch, handler):
    real_client = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)


def test_rank_prefers_newest_stable_flash():
    ids = [
        "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-3-flash-preview",
        "gemini-flash-latest", "gemini-2.5-flash", "gemini-3.5-flash",
    ]
    assert sorted(ids, key=tickets._gemini_rank) == [
        "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite",
        "gemini-flash-latest", "gemini-2.5-pro", "gemini-3-flash-preview",
    ]


async def test_list_filters_non_text_models(monkeypatch):
    tickets._gemini_models_cache.clear()
    payload = _models_payload(
        "gemini-2.5-flash", "gemini-2.5-flash-preview-tts", "gemini-2.5-flash-image",
        extra=[
            {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
            {"name": "models/gemini-embedding-001", "supportedGenerationMethods": ["embedContent"]},
        ],
    )
    _mock_httpx(monkeypatch, lambda req: httpx.Response(200, json=payload))

    models = await tickets._list_gemini_models("k1")
    assert [m["id"] for m in models] == ["gemini-2.5-flash"]


async def test_list_returns_none_on_bad_key(monkeypatch):
    tickets._gemini_models_cache.clear()
    _mock_httpx(monkeypatch, lambda req: httpx.Response(400, json={"error": {"message": "API key not valid"}}))
    assert await tickets._list_gemini_models("bad") is None


async def test_analyze_skips_retired_model_and_uses_best_free(monkeypatch, tmp_path):
    tickets._gemini_models_cache.clear()
    img = tmp_path / "t.jpg"
    img.write_bytes(b"fake")
    called = []

    def handler(req: httpx.Request):
        if req.method == "GET":
            return httpx.Response(200, json=_models_payload("gemini-2.5-flash-lite", "gemini-2.5-flash"))
        model = req.url.path.split("/")[-1].split(":")[0]
        called.append(model)
        if model == "gemini-2.0-flash":
            return httpx.Response(404, json={"error": {"message": "not found"}})
        text = '{"store_name":"Lidl","date":null,"total":3.5,"items":[]}'
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})

    _mock_httpx(monkeypatch, handler)
    result = await tickets._analyze_with_gemini(str(img), "image/jpeg", api_key="k2", preferred_model="gemini-2.0-flash")

    assert called == ["gemini-2.0-flash", "gemini-2.5-flash"]
    assert result["store_name"] == "Lidl"
    assert result["_gemini_model"] == "gemini-2.5-flash"


async def test_retired_choice_is_replaced(db, user, monkeypatch):
    tickets._gemini_models_cache.clear()
    _mock_httpx(monkeypatch, lambda req: httpx.Response(200, json=_models_payload("gemini-2.5-flash")))
    db.add(UserPreference(user_id=user.id, key="gemini_model", value="gemini-2.0-flash"))
    await db.commit()

    prefs = {"gemini_model": "gemini-2.0-flash", "gemini_api_key": "k3"}
    await tickets._replace_retired_gemini_model(db, user, prefs, {"_gemini_model": "gemini-2.5-flash"})

    pref = (await db.execute(select(UserPreference).where(UserPreference.key == "gemini_model"))).scalar_one()
    assert pref.value == "gemini-2.5-flash"


async def test_choice_kept_when_model_still_exists(db, user, monkeypatch):
    """A 429 on a model that still exists must not overwrite the user's choice."""
    tickets._gemini_models_cache.clear()
    _mock_httpx(monkeypatch, lambda req: httpx.Response(200, json=_models_payload("gemini-2.5-pro", "gemini-2.5-flash")))
    db.add(UserPreference(user_id=user.id, key="gemini_model", value="gemini-2.5-pro"))
    await db.commit()

    prefs = {"gemini_model": "gemini-2.5-pro", "gemini_api_key": "k4"}
    await tickets._replace_retired_gemini_model(db, user, prefs, {"_gemini_model": "gemini-2.5-flash"})

    pref = (await db.execute(select(UserPreference).where(UserPreference.key == "gemini_model"))).scalar_one()
    assert pref.value == "gemini-2.5-pro"
