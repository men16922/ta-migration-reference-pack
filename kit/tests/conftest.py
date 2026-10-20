from __future__ import annotations

from pathlib import Path

import pytest

from onprem_atlas.synth import generate_rows, write_xlsx


@pytest.fixture(scope="session")
def esm5000(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """합성 ESM 엑셀 5,000행 (제목 3행 + 헤더 + 데이터)."""
    return write_xlsx(tmp_path_factory.mktemp("esm") / "esm5000.xlsx", generate_rows(5000))
