import json
import subprocess
from pathlib import Path

workdir = Path(__file__).resolve().parent
workspace_id = "cws_60431178099387394"
xml_text = (workdir / "item-d.xml").read_text(encoding="utf-8-sig")
payload = xml_text.encode("utf-8")
if not xml_text.strip() or len(payload) > 1024 * 1024:
    raise SystemExit("XML 为空或超过单次 1MB 上限，未提交。")

argv = [
    "design-cli", "design-workspace", "+create",
    "--canvas-workspace-id", workspace_id,
    "--input", "-",
]

try:
    result = subprocess.run(
        argv, input=payload, shell=False, cwd=workdir,
        capture_output=True, timeout=120,
    )
except subprocess.TimeoutExpired as exc:
    (workdir / "submit-d-timeout.stdout.bin").write_bytes(exc.stdout or b"")
    (workdir / "submit-d-timeout.stderr.bin").write_bytes(exc.stderr or b"")
    raise SystemExit("写入超时，结果未知；先恢复确认，不盲目重试。")

(workdir / "submit-d.stdout.bin").write_bytes(result.stdout)
(workdir / "submit-d.stderr.bin").write_bytes(result.stderr)
(workdir / "submit-d.exitcode.txt").write_text(str(result.returncode), encoding="utf-8")
if result.returncode != 0:
    raise SystemExit(f"CLI 退出码 {result.returncode}；按已保存响应确认状态。")

response = json.loads(result.stdout.decode("utf-8", errors="strict"))
if not isinstance(response, dict) or response.get("code") != 0:
    raise SystemExit("响应未确认成功，停止后续写入并确认状态。")

xml_data = response.get("xml_data")
if not isinstance(xml_data, str) or not xml_data.strip():
    raise SystemExit("响应不完整，结果未知。")

(workdir / "created-d.xml").write_text(xml_data, encoding="utf-8")
print(xml_data)
