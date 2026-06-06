import os
import threading
from pathlib import Path

from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_community.chat_models import ChatTongyi
from langchain_community.document_loaders import TextLoader
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_text_splitters import RecursiveCharacterTextSplitter

BASE_DIR = Path(__file__).resolve().parent
KNOWLEDGE_PATH = BASE_DIR / "knowledge_base.txt"


def _format_docs(docs):
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


class RAGEngine:
    def __init__(self):
        load_dotenv()
        self.api_key = os.getenv("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise ValueError("未找到 DASHSCOPE_API_KEY，请在 .env 文件中配置")

        self.chunk_count = 0
        self.rag_chain = None
        self._lock = threading.Lock()
        self._build()

    def _build(self):
        loader = TextLoader(str(KNOWLEDGE_PATH), encoding="utf-8")
        documents = loader.load()

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
            separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
        )
        chunks = text_splitter.split_documents(documents)
        self.chunk_count = len(chunks)

        embeddings = DashScopeEmbeddings(
            model="text-embedding-v3",
            dashscope_api_key=self.api_key,
        )
        vectorstore = Chroma.from_documents(chunks, embedding=embeddings)
        retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

        llm = ChatTongyi(
            model="qwen-plus",
            dashscope_api_key=self.api_key,
            temperature=0.7,
        )

        with open(BASE_DIR / "prompt_template.txt", "r", encoding="utf-8") as f:
            prompt_template_str = f.read()
        prompt = ChatPromptTemplate.from_template(prompt_template_str)

        self.rag_chain = (
            {
                "context": retriever | _format_docs,
                "question": RunnablePassthrough(),
            }
            | prompt
            | llm
            | StrOutputParser()
        )

    def ask(self, question: str) -> str:
        with self._lock:
            return self.rag_chain.invoke(question)

    def get_knowledge(self) -> str:
        with open(KNOWLEDGE_PATH, "r", encoding="utf-8") as f:
            return f.read()

    def update_knowledge(self, content: str) -> int:
        with self._lock:
            with open(KNOWLEDGE_PATH, "w", encoding="utf-8") as f:
                f.write(content)
            self._build()
            return self.chunk_count

    @property
    def api_key_preview(self) -> str:
        return f"{self.api_key[:5]}..."
