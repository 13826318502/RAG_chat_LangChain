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


class KnowledgeResponse(BaseModel):
    content: str
    char_count: int
    chunk_count: int


class KnowledgeUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=500_000)


class KnowledgeUpdateResponse(BaseModel):
    message: str
    char_count: int
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


@app.get("/api/knowledge", response_model=KnowledgeResponse)
async def get_knowledge():
    if engine is None:
        raise HTTPException(status_code=503, detail="服务尚未就绪")
    try:
        content = engine.get_knowledge()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="知识库文件不存在")
    return KnowledgeResponse(
        content=content,
        char_count=len(content),
        chunk_count=engine.chunk_count,
    )


@app.put("/api/knowledge", response_model=KnowledgeUpdateResponse)
async def update_knowledge(req: KnowledgeUpdateRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="服务尚未就绪")
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="知识库内容不能为空")
    try:
        chunk_count = engine.update_knowledge(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新知识库失败: {e}")
    return KnowledgeUpdateResponse(
        message="知识库已保存，向量索引已重建",
        char_count=len(content),
        chunk_count=chunk_count,
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