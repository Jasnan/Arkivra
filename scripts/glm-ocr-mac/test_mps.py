"""Exercise MPS validation and fail-fast behavior without model downloads."""
from unittest.mock import patch
import base64

import pytest

from glmocr.config import LayoutConfig
from glmocr.config import PageLoaderConfig
from glmocr.cli import layout_device_type
from glmocr.dataloader.page_loader import PageLoader
from glmocr.layout.layout_detector import PPDocLayoutDetector


def test_mps_configuration_and_cli():
    assert LayoutConfig(device="mps").device == "mps"
    assert layout_device_type("mps") == "mps"


def test_mps_unavailable_fails_before_model_download():
    detector = PPDocLayoutDetector(LayoutConfig(device="mps", model_dir="dummy"))
    with patch("torch.backends.mps.is_available", return_value=False), patch(
        "glmocr.layout.layout_detector.PPDocLayoutV3ForObjectDetection.from_pretrained"
    ) as load_model:
        with pytest.raises(RuntimeError, match="MPS layout requires"):
            detector.start()
        load_model.assert_not_called()


def test_pdf_data_uri_stream_and_eager():
    loader = PageLoader(PageLoaderConfig())
    data = b"%PDF-1.7 test fixture"
    source = "data:application/pdf;base64," + base64.b64encode(data).decode()
    with patch.object(loader, "_iter_pdf_bytes", return_value=iter(["page"])) as stream:
        assert list(loader._iter_source(source)) == ["page"]
        stream.assert_called_once_with(data)
    with patch.object(loader, "_load_pdf_bytes", return_value=["page"]) as eager:
        assert loader._load_source(source) == ["page"]
        eager.assert_called_once_with(data)


def test_image_source_error_does_not_expose_payload():
    loader = PageLoader(PageLoaderConfig())
    with pytest.raises(RuntimeError) as failure:
        loader._load_image("data:image/png;base64,private-payload")
    assert "private-payload" not in str(failure.value)


def test_invalid_pdf_source_warning_does_not_expose_payload(caplog):
    loader = PageLoader(PageLoaderConfig())
    assert list(loader.iter_pages_with_unit_indices(
        "data:application/pdf;base64,private-payload"
    )) == []
    assert "private-payload" not in caplog.text
