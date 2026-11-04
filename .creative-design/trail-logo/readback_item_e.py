import json
import subprocess
from pathlib import Path

workdir = Path(__file__).resolve().parent
workspace_id = "cws_60431178099387394"
item_id = "tNDf4F2w-4TEIQBVHBS-0201"

argv = [
    "design-cli", "design-workspace", "+get",
    "--canvas-workspace-id", workspace_id,
    "--item-ids", item_id,
]
result = subprocess.run(argv, input=b"", shell=False, cwd=workdir,
                        capture_output=True, timeout=120)
(workdir / "get-e.stdout.bin").write_bytes(result.stdout)
(workdir / "get-e.stderr.bin").write_bytes(result.stderr)
(workdir / "get-e.exitcode.txt").write_text(str(result.returncode), encoding="utf-8")
if result.returncode != 0:
    raise SystemExit(f"CLI 退出码 {result.returncode}")
response = json.loads(result.stdout.decode("utf-8", errors="strict"))
if response.get("code") != 0:
    raise SystemExit("响应未确认成功")
(workdir / "readback-e.xml").write_text(response["xml_data"], encoding="utf-8")
print(response["xml_data"])
