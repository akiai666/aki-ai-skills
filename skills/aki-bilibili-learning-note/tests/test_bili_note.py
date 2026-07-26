from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "bili_note.py"
FIXTURE = ROOT / "tests" / "fixtures" / "sample_note.json"

spec = importlib.util.spec_from_file_location("bili_note", SCRIPT)
bili_note = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(bili_note)


class BiliNoteTests(unittest.TestCase):
    def test_parse_url_and_part(self) -> None:
        bvid, part = bili_note.parse_bilibili_url(
            "https://www.bilibili.com/video/BV1AB411C7mD/?p=3&t=20"
        )
        self.assertEqual(bvid, "BV1AB411C7mD")
        self.assertEqual(part, 3)

    def test_timestamp_url_is_canonical(self) -> None:
        url = bili_note.timestamp_url({"bvid": "BV1AB411C7mD", "part": 2}, 754.9)
        self.assertEqual(
            url,
            "https://www.bilibili.com/video/BV1AB411C7mD/?p=2&t=754",
        )

    def test_render_and_validate_single_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "note.html"
            render = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "render",
                    "--note",
                    str(FIXTURE),
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(render.returncode, 0, render.stderr)
            content = output.read_text(encoding="utf-8")
            self.assertIn("30 秒判断", content)
            self.assertIn("视频高光地图", content)
            self.assertIn("图文学习全文", content)
            self.assertIn("时间戳逐字稿", content)
            self.assertIn("data:image/svg+xml;base64,", content)
            self.assertIn("BV1AB411C7mD/?p=1&amp;t=620", content)
            self.assertIn(
                'BV1AB411C7mD/?p=1&amp;t=240" target="_blank" rel="noopener">'
                "用户任务与模型能力的区别",
                content,
            )
            self.assertNotIn(str(ROOT), content)

            validate = subprocess.run(
                [sys.executable, str(SCRIPT), "validate", str(output)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(validate.returncode, 0, validate.stderr)

    def test_fixture_has_six_to_twelve_highlights(self) -> None:
        note = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(note["highlights"]), 6)
        self.assertLessEqual(len(note["highlights"]), 12)


if __name__ == "__main__":
    unittest.main()
