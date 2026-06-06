from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from rag_engine import RAGEngine

BASE_DIR = Path(__file__).resolve().parent
engine: RAGEngine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    engine = RAGEngine()
    yield


app = FastAPI(title="RAG 问答系统", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str


class StatusResponse(BaseModel):
    status: str
    api_key_preview: str
    chunk_count: int


@app.get("/")
async def index():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/status", response_model=StatusResponse)
async def status():
    if engine is None:
        raise HTTPException(status_code=503, detail="服务尚未就绪")
    return StatusResponse(
        status="ready",
        api_key_preview=engine.api_key_preview,
        chunk_count=engine.chunk_count,
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="服务尚未就绪")
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="请输入有效的问题")
    try:
        answer = engine.ask(question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return ChatResponse(answer=answer)


HOST = "127.0.0.1"
PORT = 8000
URL = f"http://{HOST}:{PORT}"


def _open_browser_when_ready():
    import threading
    import time
    import urllib.error
    import urllib.request
    import webbrowser

    def _wait_and_open():
        for _ in range(120):
            try:
                with urllib.request.urlopen(f"{URL}/api/status", timeout=1) as resp:
                    if resp.status == 200:
                        webbrowser.open(URL)
                        return
            except (urllib.error.URLError, TimeoutError, OSError):
                time.sleep(1)

    threading.Thread(target=_wait_and_open, daemon=True).start()


if __name__ == "__main__":
    import sys

    import uvicorn

    if "--no-browser" not in sys.argv:
        _open_browser_when_ready()

    uvicorn.run("app:app", host=HOST, port=PORT, reload=False)