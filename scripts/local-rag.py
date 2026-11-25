"""Loopback embedding service. PostgreSQL owns the persistent vectors."""
import argparse
import hashlib
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import torch
from sentence_transformers import SentenceTransformer

DIMENSION = 512
BATCH_SIZE = 16
QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："


def model_key(directory):
    fingerprint = hashlib.sha256()
    for file in sorted(directory.rglob("*")):
        relative = file.relative_to(directory)
        if ".cache" in relative.parts or file.suffix not in {".json", ".txt", ".safetensors", ".bin", ".model"}:
            continue
        with file.open("rb") as stream:
            fingerprint.update(relative.as_posix().encode("utf-8") + b"\0")
            fingerprint.update(hashlib.file_digest(stream, "sha256").digest())
    return "bge512:" + fingerprint.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True, help="Path to a downloaded BGE model")
    parser.add_argument("--port", type=int, default=8879)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    torch.set_num_threads(4)
    model_dir = args.model.resolve(strict=True)
    model = SentenceTransformer(str(model_dir), local_files_only=True, device=args.device)
    probe = model.encode(["连接查询"], normalize_embeddings=True)
    if probe.shape != (1, DIMENSION):
        raise ValueError(f"Expected {DIMENSION} embedding dimensions")
    version = model_key(model_dir)

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, data):
            body = json.dumps(data, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            if self.path == "/model":
                self.reply(200, {"modelKey": version})
            else:
                self.reply(404, {"error": "unknown path"})

        def do_POST(self):
            if self.path != "/encode":
                self.reply(404, {"error": "unknown path"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 100_000:
                    raise ValueError()
                payload = json.loads(self.rfile.read(size))
                kind, texts = payload["kind"], payload["texts"]
                if kind not in ("query", "passage") or not isinstance(texts, list) or not 0 < len(texts) <= BATCH_SIZE:
                    raise ValueError()
                max_length = 500 if kind == "query" else 1100
                if not all(isinstance(s, str) and 0 < len(s) <= max_length for s in texts):
                    raise ValueError()
            except (ValueError, KeyError, TypeError):
                self.reply(400, {"error": "invalid inputs"})
                return

            inputs = [QUERY_PREFIX + text for text in texts] if kind == "query" else texts
            vectors = model.encode(inputs, normalize_embeddings=True, batch_size=BATCH_SIZE)
            self.reply(200, {"modelKey": version, "vectors": vectors.tolist()})

    with HTTPServer(("127.0.0.1", args.port), Handler) as server:
        print(f"Local RAG listening on {args.port} ({version})", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
