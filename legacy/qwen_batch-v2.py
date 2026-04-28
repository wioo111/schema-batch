import os
import time
import json
import asyncio
import pandas as pd
from openai import AsyncOpenAI
from tqdm.asyncio import tqdm

# ================= 配置区 =================
# 使用环境变量或统一配置文件管理
API_KEY = os.getenv("DASHSCOPE_API_KEY", "你的api") 
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

# 动态获取当前目录下的文件
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# 约定输入/输出文件名
INPUT_FILE = os.path.join(CURRENT_DIR, "舆情数据_输入模板.xlsx")
OUTPUT_FILE = os.path.join(CURRENT_DIR, "舆情数据_分析结果.xlsx")

# 并发数，不要设置太高以免触发 API 限流 (Rate Limit)
CONCURRENCY = 5 
# ==========================================

client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)

SYSTEM_PROMPT = """
你是一个顶级的网络舆情分析专家与社会心理学家。
请对以下辟谣事件下的网友评论进行深度解剖，并严格按照 JSON 格式输出。

我们要抓取的核心是网民的“对抗性解读”和对官方辟谣的“信任赤字”。

以下是该舆情事件的上下文背景，请你在分析每一条评论时，必须将该背景纳入考量：
{event_background}

请分析以下维度：
1. "情感倾向": 情感倾向（积极 / 中性 / 消极 / 极度消极）。
2. "是否存在解构情绪": 是否解构官方话语（是 / 否）。
   解构指娱乐化辟谣、反向嘲讽或不信任，“懂得都懂”、引用官方通报词汇进行反向嘲讽的，一律判定为“是”。
3. "社会信任敏感度": 社会信任敏感度（高 / 中 / 低）。
   高：明显质疑官方掩盖真相、对公权力不信任。
   中：吃瓜、调侃、半信半疑。
   低：完全相信官方通报。
4. "危害领域归属": 危害领域归属（健康危害 / 经济危害 / 社会稳定 / 其他吃瓜）。
5. "核心观点": 核心观点（15个字以内，一针见血）。

必须返回合法的 JSON 格式，不要包含任何 markdown 标记如 ```json，直接返回 JSON 对象本身。示例：
{
  "情感倾向": "消极",
  "是否存在解构情绪": "是",
  "社会信任敏感度": "高",
  "危害领域归属": "社会稳定",
  "核心观点": "讽刺官方乱定寻衅滋事"
}
"""

async def analyze_comment(semaphore, index, comment_text, event_background, max_retries=3):
    """
    异步调用 API，包含信号量控制并发和重试机制
    """
    if not isinstance(comment_text, str) or not comment_text.strip():
        return index, {"情感倾向": "无", "是否存在解构情绪": "否", "社会信任敏感度": "低", "危害领域归属": "无", "核心观点": "空评论"}

    prompt_with_context = SYSTEM_PROMPT.replace("{event_background}", event_background)

    async with semaphore:
        for attempt in range(max_retries):
            try:
                response = await client.chat.completions.create(
                    model="qwen-plus",
                    messages=[
                        {"role": "system", "content": prompt_with_context},
                        {"role": "user", "content": f"评论内容：{comment_text}"}
                    ],
                    temperature=0.1, # 降低温度，要求输出高度稳定的结构化结果
                    response_format={"type": "json_object"} # 强制 JSON 输出
                )
                result_str = response.choices[0].message.content.strip()
                # 解析 JSON
                result_json = json.loads(result_str)
                return index, result_json
            except Exception as e:
                if attempt == max_retries - 1:
                    return index, {"情感倾向": "解析失败", "是否存在解构情绪": "解析失败", "社会信任敏感度": "解析失败", "危害领域归属": "解析失败", "核心观点": f"Error: {str(e)}"}
                await asyncio.sleep(1)

async def main():
    print(f"[*] 正在加载数据: {INPUT_FILE}")
    try:
        df = pd.read_excel(INPUT_FILE)
    except FileNotFoundError:
        print(f"[!] 找不到文件: {INPUT_FILE}。请检查！")
        return

    # 极简交互：在控制台手动输入事件背景，告别对 Excel 格式的过度依赖
    print("\n" + "="*50)
    print("【关键前置配置】大模型需要了解这批评论的上下文背景。")
    print("例如：'成都某网红打卡地引发大量聚集，官方通报涉嫌寻衅滋事，网民质疑滥用口袋罪。'")
    print("="*50)
    global_event_bg = input(">>> 请输入本次舆情事件的背景描述（必须填写）：").strip()
    
    if not global_event_bg:
        print("[!] 致命错误：事件背景不能为空，否则大模型无法准确判断解构情绪。程序退出。")
        return
    print("\n[*] 背景已录入，准备启动分析引擎...\n")

    # 断点续传逻辑
    if os.path.exists(OUTPUT_FILE):
        print(f"[*] 发现已有输出文件 {OUTPUT_FILE}，将跳过已处理的数据...")
        out_df = pd.read_excel(OUTPUT_FILE)
        # 假设依据索引来判断，如果原始表和输出表行数一致则结束
        processed_indices = set(out_df['原始索引'].dropna().astype(int).tolist()) if '原始索引' in out_df.columns else set()
    else:
        out_df = pd.DataFrame()
        processed_indices = set()

    tasks = []
    semaphore = asyncio.Semaphore(CONCURRENCY)
    
    # 筛选未处理的数据，同时支持一级评论和二级评论的拼接
    to_process = []
    for index, row in df.iterrows():
        if index not in processed_indices:
            # 获取一级评论
            primary_comment = str(row.get('评论内容', '')).strip()
            if primary_comment == 'nan': primary_comment = ""
            
            # 获取二级评论
            secondary_comment = str(row.get('二级评论内容', '')).strip()
            if secondary_comment == 'nan': secondary_comment = ""
            
            # 暴力拼接：让大模型看到“谁在回复谁”的完整逻辑链
            if primary_comment and secondary_comment:
                comment_text = f"【主评论】：{primary_comment} | 【该条二级回复】：{secondary_comment}"
            elif secondary_comment:
                comment_text = secondary_comment
            else:
                comment_text = primary_comment
                
            to_process.append((index, comment_text, global_event_bg))

    print(f"[*] 共计 {len(df)} 条，需处理 {len(to_process)} 条...")

    for index, comment, bg in to_process:
        tasks.append(analyze_comment(semaphore, index, comment, bg))

    results = []
    # 使用 tqdm 显示异步进度条
    for f in tqdm(asyncio.as_completed(tasks), total=len(tasks), desc="Processing"):
        index, res_json = await f
        results.append({
            "原始索引": index,
            "评论内容": df.loc[index, '评论内容'] if '评论内容' in df.columns else "",
            "情感倾向": res_json.get("情感倾向", ""),
            "是否存在解构情绪": res_json.get("是否存在解构情绪", ""),
            "社会信任敏感度": res_json.get("社会信任敏感度", ""),
            "危害领域归属": res_json.get("危害领域归属", ""),
            "核心观点": res_json.get("核心观点", "")
        })
        
        # 每处理 20 条，实时落盘一次（防崩溃）
        if len(results) % 20 == 0:
            temp_df = pd.DataFrame(results)
            if not out_df.empty:
                combined_df = pd.concat([out_df, temp_df]).drop_duplicates(subset=['原始索引'])
            else:
                combined_df = temp_df
            combined_df.to_excel(OUTPUT_FILE, index=False)

    # 最终完整落盘
    temp_df = pd.DataFrame(results)
    if not out_df.empty:
        combined_df = pd.concat([out_df, temp_df]).drop_duplicates(subset=['原始索引']).sort_values('原始索引')
    else:
        combined_df = temp_df.sort_values('原始索引')
        
    # 合并原始数据的其他列（如点赞数等）
    final_df = df.copy()
    final_df['原始索引'] = final_df.index
    final_df = pd.merge(final_df, combined_df.drop(columns=['评论内容']), on='原始索引', how='left')
    
    final_df.to_excel(OUTPUT_FILE, index=False)
    print(f"\n[*] Boom! 任务完成，数据已导出至: {OUTPUT_FILE}")

if __name__ == "__main__":
    # Windows 下 asyncio 可能会报错，加上这个
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
