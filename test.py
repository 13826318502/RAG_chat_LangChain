# 导入操作系统模块
import os
# 便于从.env文件加载环境变量(读取API密钥)
from dotenv import load_dotenv

# 1. 加载环境变量（API密钥）
load_dotenv()
api_key = os.getenv("DASHSCOPE_API_KEY")
# 显示前5位密钥即可以判断是否正确，也防止泄露
print(f"已加载 API 密钥: {api_key[:5]}...")

# 2. 导入 LangChain 组件
# 专门用来加载.txt文本文件的加载器
from langchain_community.document_loaders import TextLoader
# 递归文本分割器(根据选取的文本长度按段落->句子->固定长度的顺序划分)
from langchain_text_splitters import RecursiveCharacterTextSplitter
# 轻量级的向量数据库专用包
from langchain_chroma import Chroma
# 阿里云通义千问的嵌入模型
from langchain_community.embeddings import DashScopeEmbeddings
# 阿里云通义千问的对话模型
from langchain_community.chat_models import ChatTongyi
# 创建聊天提示词的工具
from langchain_core.prompts import ChatPromptTemplate
# 把输入传递到下一步(知识库检索到的内容->用户的输入，两个加在一起变成问题)
from langchain_core.runnables import RunnablePassthrough
# 字符串输出解析器，从AI返回的对象中提取纯文本
from langchain_core.output_parsers import StrOutputParser

# ========== 步骤1：加载文档 ==========
print("\n📄 步骤1：加载文档...")
# 创建一个文本加载器对象，以utf-8的模式传输
loader = TextLoader("knowledge_base.txt", encoding="utf-8")
# 执行加载模块
documents = loader.load()
print(f"   已加载 {len(documents)} 个文档")

# ========== 步骤2：文本分割 ==========
print("\n✂️ 步骤2：分割文本...")
# 递归文本分割器
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,  # 每块最多500个字符
    chunk_overlap=50,  # 相邻块重叠50个字符
    # 优先级按大段落(\n\n)，小段落(\n)，句子，空格，字符
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""]
)
# 将读取到的文档进行递归划分
chunks = text_splitter.split_documents(documents)
print(f"   已分割成 {len(chunks)} 个文本片段")

# 打印片段预览
for i, chunk in enumerate(chunks):
    print(f"   片段{i + 1}: {chunk.page_content[:50]}...")

# ========== 步骤3：创建向量存储 ==========
print("\n🔢 步骤3：创建向量存储...")
embeddings = DashScopeEmbeddings(
    # 通义千问的嵌入模型
    model="text-embedding-v3",
    # 在环境变量中找到的api
    dashscope_api_key=api_key
)

# 通过调用通义千问的模型(embeddings)将分割后的文本(chunks)转成向量的形式
vectorstore = Chroma.from_documents(chunks, embedding=embeddings)
print("   ✅ 向量存储创建完成")

# ========== 步骤4：创建检索器 ==========
print("\n🔍 步骤4：创建检索器...")
# 将向量存储为可以检索的对象
retriever = vectorstore.as_retriever(
    search_kwargs={"k": 3}  # 每次检索返回最相关的3个片段
)
print("   ✅ 检索器已就绪")

# ========== 步骤5：初始化大模型 ==========
print("\n🤖 步骤5：初始化通义千问模型...")
llm = ChatTongyi(
    # 对话模型
    model="qwen-plus",
    # 模型的api
    dashscope_api_key=api_key,
    # 0为确定(让高概率的概率更高)，1为随机(让低概率的概率更高)
    # 模型拉大概率之间的差距，让高概率的更高，低概率的更低，但依然保留随机性。
    temperature=0.7  # 控制回答的随机性
)
print("   ✅ 模型已就绪")

# ========== 步骤6：设计提示词模板 ==========
print("\n📝 步骤6：设计提示词模板...")
# 从字符串中创建提示词
prompt = ChatPromptTemplate.from_template("""
你是一个专业的知识助手。请严格根据以下【上下文】内容回答用户的问题。

【上下文】
{context}

【用户问题】
{question}

【回答要求】
1. 只能基于上面的【上下文】回答，不要使用你自己的知识
2. 如果【上下文】中没有相关信息，请直接回答："根据现有知识库，我无法回答这个问题"
3. 回答要简洁、准确、有条理
4. 如果上下文中有多条相关信息，请综合后回答

现在开始回答：
""")
print("   ✅ 提示词模板已就绪")

# ========== 步骤7：构建 RAG 链 ==========
print("\n🔗 步骤7：构建 RAG 处理链...")


def format_docs(docs):
    """将检索到的文档片段格式化成一个字符串"""
    # doc.page_content表示获取文档片段的文本内容
    # 对每个在docs列表(包含多个Document对象)中的对象doc提取他的文本内容属性page_content
    # join表示将所有的字符串都连接起来(中间以\n\n--\n\n的方式连接)
    # 例如"A"和"B"->"A\n\n---\n\nB"
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


# RAG 链：检索 → 格式化 → 提示词组合 → 调用模型 → 解析输出
rag_chain = (
        {
            # 表示先后执行两步先retriever接受用户问题，去向量数据库检索相关的文档片段
            # 再将检索到的文档片段列表format_docs格式化为一个大字符串
            # 分别为前面的两个函数(retriever本质是一个封装了"检索操作"的Runnable对象)
            "context": retriever | format_docs,  # 先检索，再格式化
            # 传递用户问题的对象
            "question": RunnablePassthrough()  # 用户问题直接传递
        }
        | prompt  # 组合上下文和问题，这里是前面创造了提示词的对象
        | llm  # 调用大模型，通义千问的大模型
        | StrOutputParser()  # 提取回答文本
)
print("   ✅ RAG 链构建完成")

# ========== 步骤8：启动交互式问答 ==========
print("\n" + "=" * 60)
print("🎉 RAG 问答系统已启动！")
print("=" * 60)
print("💡 提示：输入问题后按回车，输入 'quit' 或 'exit' 退出\n")

while True:
    # 获取用户输入，strip()表示去掉首尾空白部分
    question = input("🙋 你问: ").strip()

    # 退出条件，将用户的问题(输入)小写后如果是以下三种则退出
    if question.lower() in ["quit", "exit", "q"]:
        print("\n👋 再见！")
        break

    # 跳过空输入
    if not question:
        print("⚠️ 请输入有效的问题\n")
        continue

    # 调用 RAG 链生成回答end=""表示打印内容不换行，默认是换行符，flush=True表示强制清空缓冲区立即将内容打印出来
    print("🤖 我答: ", end="", flush=True)
    try:
        # 这里执行会耗时间所以前面要直接打印，invoke为LangChain的统一调用方法
        answer = rag_chain.invoke(question)
        print(answer)
    except Exception as e:
        print(f"\n❌ 出错了: {e}")

    print("-" * 50 + "\n")