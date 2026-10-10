"""Local SDK wrapper: serialized requests, leases and content-free progress."""
import argparse
import threading
import time
import uuid

from flask import jsonify, request


def install_monitoring(app, pipeline, lease_seconds=90, maximum_seconds=7200):
    gate = threading.Lock()
    mutex = threading.Lock()
    idle = threading.Condition(mutex)
    inflight = 0
    status = {"active": False}
    original_parse = app.view_functions["parse"]
    original_ocr = pipeline.ocr_client.process

    def cancel(reason):
        status["cancel_reason"] = status.get("cancel_reason") or reason
        state = pipeline._current_state
        if state is not None:
            state.request_shutdown()

    def monitored_ocr(*args, **kwargs):
        nonlocal inflight
        with mutex:
            owner = status.get("request_id")
            if status.get("cancel_reason"):
                return {"error": "Extraction cancelled"}, 499
            status["ocr_calls_started"] += 1
            inflight += 1
        started = time.monotonic()
        result = None
        try:
            result = original_ocr(*args, **kwargs)
        finally:
            with idle:
                inflight -= 1
                if status.get("request_id") == owner:
                    status["ocr_calls_completed"] += 1
                    status["last_ocr_seconds"] = round(time.monotonic() - started, 2)
                    status["last_ocr_status"] = result[1] if result else 500
                    status["last_progress_at"] = time.time()
                    if result is None or result[1] != 200:
                        cancel("ocr_request_failed")
                idle.notify_all()
        if result[1] != 200:
            raise RuntimeError(f"OCR region request failed ({result[1]})")
        return result

    pipeline.ocr_client.process = monitored_ocr

    def guarded_parse():
        if not gate.acquire(blocking=False):
            return jsonify(error="SDK is busy processing another document"), 503
        stop_watchdog = threading.Event()
        with mutex:
            status.clear()
            status.update(
                active=True,
                request_id=request.headers.get("x-arkivra-request-id") or str(uuid.uuid4()),
                started_at=time.time(), last_progress_at=None,
                ocr_calls_started=0, ocr_calls_completed=0,
                last_ocr_seconds=None, last_ocr_status=None, cancel_reason=None,
            )
            status["last_heartbeat"] = time.monotonic()
            status["requires_lease"] = request.headers.get("x-arkivra-lease") == "1"
        started = time.monotonic()

        def watchdog():
            while not stop_watchdog.wait(1):
                with mutex:
                    if time.monotonic() - started > maximum_seconds:
                        cancel("extraction_timeout")
                    elif status["requires_lease"] and (
                        time.monotonic() - status["last_heartbeat"] > lease_seconds
                    ):
                        cancel("worker_heartbeat_expired")

        watcher = threading.Thread(target=watchdog, daemon=True)
        watcher.start()
        try:
            result = original_parse()
            with mutex:
                if status["cancel_reason"]:
                    return jsonify(error="Extraction cancelled"), 504
            return result
        finally:
            stop_watchdog.set()
            watcher.join(timeout=2)
            with idle:
                # Keep the gate until the current HTTP recognition call finishes;
                # cancellation stops later regions, not an already-running call.
                while inflight:
                    idle.wait(timeout=1)
                status["active"] = False
                status["finished_at"] = time.time()
            gate.release()

    app.view_functions["parse"] = guarded_parse

    @app.get("/status")
    def extraction_status():
        with mutex:
            snapshot = {k: v for k, v in status.items()
                        if k not in ("last_heartbeat", "requires_lease")}
            if snapshot["active"]:
                snapshot["elapsed_seconds"] = round(time.time() - snapshot["started_at"], 1)
                snapshot["heartbeat_age_seconds"] = round(
                    time.monotonic() - status["last_heartbeat"], 1
                )
            state = pipeline._current_state
            if state is not None:
                snapshot["pages_loaded"] = state.num_images_loaded[0]
                snapshot["pages_with_layout"] = len(state.layout_results_dict)
                snapshot["page_queue_size"] = state.page_queue.qsize()
                snapshot["region_queue_size"] = state.region_queue.qsize()
        return jsonify(snapshot)

    @app.post("/glmocr/heartbeat/<request_id>")
    def heartbeat(request_id):
        with mutex:
            if not status["active"] or status.get("request_id") != request_id:
                return jsonify(error="No matching active request"), 404
            status["last_heartbeat"] = time.monotonic()
        return jsonify(ok=True)

    @app.post("/glmocr/cancel/<request_id>")
    def cancel_request(request_id):
        with mutex:
            if not status["active"] or status.get("request_id") != request_id:
                return jsonify(error="No matching active request"), 404
            cancel("requested")
        return jsonify(ok=True), 202


def main():
    from glmocr.config import load_config
    from glmocr.server import create_app
    from glmocr.utils.logging import configure_logging

    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    configure_logging(level=config.logging.level)
    app = create_app(config)
    pipeline = app.config["pipeline"]
    install_monitoring(app, pipeline)
    pipeline.start()
    try:
        app.run(host=config.server.host, port=config.server.port,
                debug=False, threaded=True)
    finally:
        pipeline.stop()


if __name__ == "__main__":
    main()
