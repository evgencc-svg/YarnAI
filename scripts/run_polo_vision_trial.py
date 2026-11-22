"""Run one bounded, isolated trial using the production HTTP app and a saved polo request.

Pass the directory containing request.json and the six illustrated rib samples.
The ledger prevents a second transport for an interrupted or repeated case.
"""
import argparse
import base64
import hashlib
import json
import os
import sqlite3
import threading
from copy import deepcopy
from pathlib import Path

import uvicorn
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--cases", nargs="+", choices=["correct","under","over","shape","ambiguous","other"],
                        default=["under","over","ambiguous","shape","other","correct"])
    args = parser.parse_args()
    folder = args.directory.resolve()
    template = json.loads((folder/"request.json").read_text(encoding="utf-8"))
    assert template["identity"]["checkpoint_identity"]["checkpoint_id"] == "back_rib.rib"
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("Server credential unavailable. No request sent.")
    ledger = folder/"trial.sqlite3"
    os.environ.update(YARNAI_VISION_ENABLED="true", YARNAI_VISION_JOURNAL=str(ledger))
    from yarnai.http import create_app
    server = uvicorn.Server(uvicorn.Config(create_app(), host="127.0.0.1", port=0, log_level="warning"))
    sock = server.config.bind_socket()
    origin = "http://127.0.0.1:"+str(sock.getsockname()[1])
    thread = threading.Thread(target=server.run, kwargs={"sockets":[sock]}, daemon=True)
    thread.start()
    from time import monotonic, sleep
    deadline=monotonic()+10
    report_path=folder/"results.json"
    report=json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else []
    try:
        while not server.started and monotonic()<deadline: sleep(.05)
        config=json.load(urlopen(origin+"/api/v1/vision-reviews/configuration?flow=polo",timeout=5))
        if not config["enabled"]: raise SystemExit("Production configuration disabled.")
        for case in args.cases:
            payload=deepcopy(template)
            data=(folder/(case+".png")).read_bytes()
            digest=hashlib.sha256(data).hexdigest()
            if any(row["case"]==case and row.get("image_sha256",digest)==digest and row.get("usage") for row in report):
                continue
            operation=hashlib.sha256((template["review_session_id"]+digest).encode()).hexdigest()
            payload["review_session_id"]=operation
            payload["photos"]=[dict(photo_id=digest[:32],sha256=digest,mime_type="image/png",
                                    content_base64=base64.b64encode(data).decode())]
            req=Request(origin+"/api/v1/vision-reviews",data=json.dumps(payload).encode(),
                        headers={"Content-Type":"application/json","Origin":origin})
            try:
                verdict=json.load(urlopen(req,timeout=100))
                row={"case":case,"verdict":verdict["verdict"],"observations":verdict["observations"],
                     "missing":verdict["missing_evidence"]}
            except HTTPError as exc:
                row={"case":case,"http":exc.code,"error":json.load(exc)["error"]["code"]}
            with sqlite3.connect(ledger) as db:
                detail=db.execute("SELECT provider_status,usage,cost_usd FROM reviews WHERE id=?",(operation,)).fetchone()
            row["provider_status"],row["usage"],row["estimated_usd"]=detail or (None,None,None)
            row["image_sha256"]=digest
            report.append(row)
            (folder/"results.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
            print(case,row.get("verdict",row.get("error")),row["provider_status"],row["estimated_usd"],flush=True)
            if "error" in row or (case!="correct" and row["verdict"]=="verified_continue"):
                break
    finally:
        server.should_exit=True
        thread.join(6)
        sock.close()
    expected = {"correct":{"verified_continue"}, "ambiguous":{"more_evidence_required","cannot_determine"}}
    expected["other"] = {"correction_required","more_evidence_required","cannot_determine"}
    expected["shape"] = {"correction_required","more_evidence_required","cannot_determine"}
    negative = {"correction_required","more_evidence_required"}
    latest={row["case"]:row for row in report}
    if any(latest.get(case,{}).get("verdict") not in expected.get(case,negative) for case in args.cases):
        raise SystemExit("NOT READY: inspect results.json. No automatic retry.")


if __name__=="__main__":
    main()
