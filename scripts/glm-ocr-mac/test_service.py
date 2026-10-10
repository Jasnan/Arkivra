import threading
from types import SimpleNamespace
from flask import Flask, jsonify

from service import install_monitoring


def make_app(handler=None, **limits):
    app = Flask(__name__)
    pipeline = SimpleNamespace(_current_state=None,
                               ocr_client=SimpleNamespace(process=lambda *_: ({}, 200)))

    @app.post("/glmocr/parse", endpoint="parse")
    def parse():
        if handler:
            return handler(pipeline)
        pipeline.ocr_client.process({"content": "private OCR input"})
        return jsonify(json_result=[[{"content": "private OCR output"}]])

    install_monitoring(app, pipeline, **limits)
    return app, pipeline


def test_status_counts_without_contents():
    app, _ = make_app()
    with app.test_client() as client:
        assert client.get("/status").json == {"active": False}
        assert client.post("/glmocr/parse").status_code == 200
        status = client.get("/status").json
        assert status["active"] is False
        assert status["ocr_calls_completed"] == 1
        assert "private" not in str(status)


def test_busy_request_is_rejected_and_cancel_matches_request_id():
    started = threading.Event()
    cancelled = threading.Event()

    def handler(pipeline):
        pipeline._current_state = SimpleNamespace(request_shutdown=cancelled.set)
        started.set()
        assert cancelled.wait(3)
        pipeline._current_state = None
        return jsonify(ok=True)

    app, _ = make_app(handler)
    responses = []
    def run():
        with app.test_client() as client:
            responses.append(client.post("/glmocr/parse", headers={
                "x-arkivra-request-id": "request-one", "x-arkivra-lease": "1"
            }).status_code)
    worker = threading.Thread(target=run)
    worker.start()
    assert started.wait(2)
    with app.test_client() as client:
        assert client.post("/glmocr/parse").status_code == 503
        assert client.post("/glmocr/cancel/wrong-request").status_code == 404
        assert not cancelled.is_set()
        assert client.post("/glmocr/heartbeat/request-one").status_code == 200
        assert client.post("/glmocr/cancel/request-one").status_code == 202
    worker.join(3)
    assert responses == [504]


def test_worker_lease_expiration_cancels_processing():
    cancelled = threading.Event()
    def handler(pipeline):
        pipeline._current_state = SimpleNamespace(request_shutdown=cancelled.set)
        assert cancelled.wait(3)
        pipeline._current_state = None
        return jsonify(ok=True)
    app, _ = make_app(handler, lease_seconds=0)
    with app.test_client() as client:
        assert client.post("/glmocr/parse", headers={"x-arkivra-lease": "1"}).status_code == 504
        assert client.get("/status").json["cancel_reason"] == "worker_heartbeat_expired"


def test_failed_ocr_region_cancels_whole_document():
    cancelled = threading.Event()
    def handler(pipeline):
        pipeline._current_state = SimpleNamespace(request_shutdown=cancelled.set)
        try:
            pipeline.ocr_client.process({})
        except RuntimeError:
            pass
        pipeline._current_state = None
        return jsonify(ok=True)
    app = Flask(__name__)
    pipeline = SimpleNamespace(_current_state=None, ocr_client=SimpleNamespace(
        process=lambda *_: ({"error": "private provider payload"}, 500)
    ))
    app.add_url_rule("/glmocr/parse", "parse", lambda: handler(pipeline), methods=["POST"])
    install_monitoring(app, pipeline)
    with app.test_client() as client:
        assert client.post("/glmocr/parse").status_code == 504
        assert cancelled.is_set()
        status = client.get("/status").json
        assert status["cancel_reason"] == "ocr_request_failed"
        assert "private" not in str(status)
