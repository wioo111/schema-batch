import argparse
import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml
from openai import AsyncOpenAI
from tqdm import tqdm


class SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


class UniversalDataRefiner:
    def __init__(
        self,
        config_path,
        input_file,
        output_file,
        api_key=None,
        base_url=None,
        model_name=None,
        concurrency=5,
        progress_file=None,
    ):
        self.config = self._load_config(config_path)
        self.input_file = input_file
        self.output_file = output_file
        self.output_path = Path(output_file)
        self.working_result_path = self.output_path.with_name(
            f"{self.output_path.stem}.working.csv"
        )
        self.progress_path = (
            Path(progress_file)
            if progress_file
            else self.output_path.with_suffix(".progress.json")
        )

        llm_config = self.config.get("llm", {})
        legacy_model_config = self.config.get("model", {})
        runtime_config = self.config.get("runtime", {})

        self.api_key_env = llm_config.get("api_key_env")
        env_api_key = os.getenv(self.api_key_env) if self.api_key_env else None
        self.api_key = api_key or llm_config.get("api_key") or env_api_key
        if not self.api_key:
            if self.api_key_env:
                raise ValueError(
                    f"未配置 API KEY。请通过 --api-key 传入，或设置环境变量 {self.api_key_env}。"
                )
            raise ValueError(
                "未配置 API KEY。请通过 --api-key 传入，或在 llm.api_key_env 中指定环境变量名。"
            )

        self.base_url = base_url or llm_config.get("base_url")
        client_kwargs = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        self.client = AsyncOpenAI(**client_kwargs)

        self.concurrency = max(1, int(concurrency))
        self.flush_interval = max(10, int(runtime_config.get("flush_interval", 50)))
        timeout_ms = llm_config.get(
            "timeout_ms",
            legacy_model_config.get("timeout_ms", 120000),
        )
        self.request_timeout_seconds = max(5, int(timeout_ms) / 1000)
        self.max_retries = max(
            1,
            int(
                llm_config.get(
                    "max_retries",
                    legacy_model_config.get("max_retries", 3),
                )
            ),
        )

        self.model_name = (
            model_name
            or llm_config.get("model")
            or legacy_model_config.get("name")
        )
        if not self.model_name:
            raise ValueError("未配置模型名称。请通过 --model 传入，或在 llm.model 中指定。")
        self.temperature = llm_config.get(
            "temperature",
            legacy_model_config.get("temperature", 0.1),
        )

        task_config = self.config.get("task", {})
        prompt_config = self.config.get("prompt", {})
        input_config = self.config.get("input", self.config.get("data_mapping", {}))
        output_config = self.config.get("output", {})

        self.system_prompt_template = prompt_config.get("system", "")
        self.user_prompt_template = prompt_config.get(
            "user",
            task_config.get("user_prompt_template", "请处理以下文本：\n{text}"),
        )
        self.preprocess_config = self._normalize_preprocess_config(
            input_config.get("preprocess", {})
        )
        self.input_columns = self._normalize_input_columns(
            input_config.get("columns", input_config.get("input_columns", []))
        )
        self.join_separator = input_config.get("join_separator", " | ")
        self.include_combined_text = output_config.get("include_combined_text", True)
        self.expected_fields = self._normalize_output_fields(
            output_config.get("fields", self.config.get("expected_output_fields", []))
        )

    def _load_config(self, path):
        with open(path, "r", encoding="utf-8") as file:
            return yaml.safe_load(file) or {}

    def _normalize_input_columns(self, columns):
        normalized = []
        for column in columns:
            if isinstance(column, str):
                normalized.append({"name": column, "label": column})
            elif isinstance(column, dict) and column.get("name"):
                normalized.append(
                    {
                        "name": column["name"],
                        "label": column.get("label", column["name"]),
                    }
                )
        return normalized

    def _normalize_output_fields(self, fields):
        normalized = []
        for field in fields:
            if isinstance(field, str):
                normalized.append({"name": field, "default": ""})
            elif isinstance(field, dict) and field.get("name"):
                normalized.append(
                    {
                        "name": field["name"],
                        "default": field.get("default", ""),
                    }
                )
        return normalized

    def _normalize_preprocess_config(self, config):
        config = config or {}
        max_chars = config.get("max_chars")
        try:
            max_chars = int(max_chars) if max_chars not in (None, "") else None
        except (TypeError, ValueError):
            max_chars = None

        if max_chars is not None and max_chars <= 0:
            max_chars = None

        return {
            "trim_whitespace": config.get("trim_whitespace", True),
            "collapse_whitespace": config.get("collapse_whitespace", True),
            "remove_line_breaks": config.get("remove_line_breaks", False),
            "strip_html": config.get("strip_html", False),
            "max_chars": max_chars,
        }

    def _render_template(self, template, values):
        return template.format_map(SafeDict(values))

    def _now_string(self):
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    def _clean_cell_value(self, value):
        if pd.isna(value):
            return ""
        text = str(value).strip()
        if text.lower() in {"nan", "none", "null"}:
            return ""
        return text

    def _apply_preprocess(self, text):
        if not text:
            return ""

        processed = text
        if self.preprocess_config["strip_html"]:
            processed = re.sub(r"<[^>]+>", " ", processed)

        if self.preprocess_config["remove_line_breaks"]:
            processed = processed.replace("\r", " ").replace("\n", " ")

        if self.preprocess_config["collapse_whitespace"]:
            processed = re.sub(r"\s+", " ", processed)

        if self.preprocess_config["trim_whitespace"]:
            processed = processed.strip()

        max_chars = self.preprocess_config["max_chars"]
        if max_chars is not None and len(processed) > max_chars:
            processed = processed[:max_chars].rstrip()

        return processed

    def _read_table(self, file_path):
        suffix = Path(file_path).suffix.lower()
        if suffix == ".csv":
            return pd.read_csv(file_path)
        if suffix in {".xlsx", ".xls"}:
            return pd.read_excel(file_path)
        raise ValueError("仅支持 .csv / .xlsx / .xls 文件。")

    def _write_table(self, df, file_path):
        file_path = Path(file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = file_path.parent / f"{file_path.stem}.tmp{file_path.suffix}"

        suffix = file_path.suffix.lower()
        if suffix == ".csv":
            df.to_csv(temp_path, index=False, encoding="utf-8-sig")
            os.replace(temp_path, file_path)
            return
        if suffix in {".xlsx", ".xls"}:
            df.to_excel(temp_path, index=False)
            os.replace(temp_path, file_path)
            return
        raise ValueError("输出文件仅支持 .csv / .xlsx / .xls 格式。")

    def _build_combined_text(self, row):
        text_parts = []
        for column in self.input_columns:
            value = self._apply_preprocess(
                self._clean_cell_value(row.get(column["name"], ""))
            )
            if value:
                text_parts.append(f'{column["label"]}：{value}')
        return self.join_separator.join(text_parts)

    def _build_prompt_values(self, combined_text, global_context):
        return {
            "text": combined_text,
            "global_context": global_context,
            "context": global_context,
        }

    def _build_system_prompt(self, combined_text, global_context):
        prompt_values = self._build_prompt_values(combined_text, global_context)
        return self._render_template(self.system_prompt_template, prompt_values)

    def _build_user_prompt(self, combined_text, global_context):
        prompt_values = self._build_prompt_values(combined_text, global_context)
        return self._render_template(self.user_prompt_template, prompt_values)

    def _normalize_result(self, result_json):
        normalized = {}
        for field in self.expected_fields:
            field_name = field["name"]
            value = result_json.get(field_name)
            if value is None or value == "":
                value = field["default"] or "解析缺失"
            normalized[field_name] = value
        return normalized

    def _build_error_result(self, message):
        return {
            field["name"]: f"Error: {message}"
            for field in self.expected_fields
        }

    def _row_has_error(self, row_data):
        return any(
            str(row_data.get(field["name"], "")).startswith("Error:")
            for field in self.expected_fields
        )

    def _build_result_row(self, index, raw_text, result_json):
        row_data = {"原始索引": index}
        if self.include_combined_text:
            row_data["拼接文本"] = raw_text
        row_data.update(self._normalize_result(result_json))
        return row_data

    def _result_columns(self):
        columns = ["原始索引"]
        if self.include_combined_text:
            columns.append("拼接文本")
        columns.extend(field["name"] for field in self.expected_fields)
        return columns

    def _extract_existing_results(self, df):
        if "原始索引" not in df.columns:
            return {}

        available_columns = [
            column for column in self._result_columns() if column in df.columns
        ]
        if "原始索引" not in available_columns:
            return {}

        result_store = {}
        for _, row in df[available_columns].dropna(subset=["原始索引"]).iterrows():
            index = int(row["原始索引"])
            row_data = {"原始索引": index}
            if self.include_combined_text:
                row_data["拼接文本"] = self._clean_cell_value(row.get("拼接文本", ""))
            for field in self.expected_fields:
                row_data[field["name"]] = row.get(field["name"], field["default"])
            result_store[index] = row_data
        return result_store

    def _write_partial_results(self, result_store):
        if not result_store:
            return

        rows = [result_store[index] for index in sorted(result_store)]
        result_df = pd.DataFrame(rows)
        result_df = result_df.reindex(columns=self._result_columns())
        self._write_table(result_df, self.working_result_path)

    def _build_final_output(self, original_df, result_store):
        result_rows = [result_store[index] for index in sorted(result_store)]
        result_df = pd.DataFrame(result_rows)
        if result_df.empty:
            result_df = pd.DataFrame(columns=self._result_columns())
        else:
            result_df = result_df.reindex(columns=self._result_columns())

        final_df = original_df.copy()
        final_df["原始索引"] = final_df.index
        return pd.merge(final_df, result_df, on="原始索引", how="left")

    def _write_progress(
        self,
        status,
        total_rows,
        completed_rows,
        failed_rows,
        output_file_path,
    ):
        self.progress_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "status": status,
            "totalRows": total_rows,
            "completedRows": completed_rows,
            "failedRows": failed_rows,
            "processedRows": completed_rows,
            "outputFilePath": str(output_file_path),
            "previewFilePath": str(self.working_result_path),
            "updatedAt": self._now_string(),
        }
        temp_path = (
            self.progress_path.parent
            / f"{self.progress_path.stem}.tmp{self.progress_path.suffix}"
        )
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp_path, self.progress_path)

    def _is_retryable_error(self, error):
        message = str(error).lower()
        hard_fail_markers = [
            "401",
            "403",
            "authentication",
            "unauthorized",
            "invalid api key",
            "model not found",
            "bad request",
        ]
        if any(marker in message for marker in hard_fail_markers):
            return False

        retryable_markers = [
            "timeout",
            "timed out",
            "429",
            "rate limit",
            "connection",
            "temporarily unavailable",
            "server error",
            "502",
            "503",
            "504",
        ]
        return isinstance(error, (asyncio.TimeoutError, json.JSONDecodeError)) or any(
            marker in message for marker in retryable_markers
        )

    async def _request_model(self, system_prompt, user_prompt):
        request = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=self.temperature,
            response_format={"type": "json_object"},
        )
        return await asyncio.wait_for(
            request,
            timeout=self.request_timeout_seconds,
        )

    async def _analyze_record(self, index, raw_text, global_context):
        if not raw_text.strip():
            empty_result = {
                field["name"]: "空数据"
                for field in self.expected_fields
            }
            return index, empty_result

        system_prompt = self._build_system_prompt(raw_text, global_context)
        user_prompt = self._build_user_prompt(raw_text, global_context)
        last_error = None

        for attempt in range(self.max_retries):
            try:
                response = await self._request_model(system_prompt, user_prompt)
                result_str = response.choices[0].message.content.strip()
                result_json = json.loads(result_str)
                return index, self._normalize_result(result_json)
            except Exception as error:
                last_error = error
                if attempt == self.max_retries - 1 or not self._is_retryable_error(error):
                    break
                await asyncio.sleep(min(5, 2 ** attempt))

        return index, self._build_error_result(str(last_error))

    async def run(self, global_context):
        print(f"[*] 引擎启动 | 读取配置：{self.config.get('name', '未命名任务')}")

        try:
            df = self._read_table(self.input_file)
        except FileNotFoundError:
            print(f"[!] 找不到输入文件: {self.input_file}")
            return
        except ValueError as error:
            print(f"[!] {error}")
            return

        existing_results = {}
        existing_source = None
        if self.working_result_path.exists():
            existing_source = self.working_result_path
        elif os.path.exists(self.output_file):
            existing_source = Path(self.output_file)

        if existing_source is not None:
            print(f"[*] 发现已有进度 {existing_source}，将跳过已处理的数据...")
            try:
                existing_df = self._read_table(existing_source)
                existing_results = self._extract_existing_results(existing_df)
            except Exception as error:
                print(f"[!] 读取已有输出失败，将按全新任务继续：{error}")

        processed_indices = set(existing_results.keys())
        failed_rows = sum(
            1 for row in existing_results.values() if self._row_has_error(row)
        )
        total_rows = len(df)

        to_process = []
        for index, row in df.iterrows():
            if index in processed_indices:
                continue
            raw_text = self._build_combined_text(row)
            to_process.append((index, raw_text))

        print(f"[*] 总计数据量: {total_rows} | 待处理量: {len(to_process)}")
        self._write_progress(
            status="running" if to_process else "completed",
            total_rows=total_rows,
            completed_rows=len(existing_results),
            failed_rows=failed_rows,
            output_file_path=self.output_file,
        )

        if not to_process:
            if existing_results:
                self._write_partial_results(existing_results)
                final_df = self._build_final_output(df, existing_results)
                self._write_table(final_df, self.output_file)
            print("\n[*] 没有需要处理的新数据。")
            return

        result_store = dict(existing_results)
        pending_buffer = []
        task_iterator = iter(to_process)
        running_tasks = {}

        def schedule_next():
            try:
                next_index, next_text = next(task_iterator)
            except StopIteration:
                return False

            task = asyncio.create_task(
                self._analyze_record(
                    next_index,
                    next_text,
                    global_context,
                )
            )
            running_tasks[task] = (next_index, next_text)
            return True

        for _ in range(min(self.concurrency, len(to_process))):
            schedule_next()

        try:
            with tqdm(total=len(to_process), desc="执行进度") as progress_bar:
                while running_tasks:
                    done, _ = await asyncio.wait(
                        running_tasks.keys(),
                        return_when=asyncio.FIRST_COMPLETED,
                    )

                    for task in done:
                        index, raw_text = running_tasks.pop(task)
                        try:
                            _, result_json = task.result()
                        except Exception as error:
                            result_json = self._build_error_result(str(error))

                        row_data = self._build_result_row(index, raw_text, result_json)
                        previous_row = result_store.get(index)
                        was_failed = (
                            self._row_has_error(previous_row) if previous_row else False
                        )
                        is_failed = self._row_has_error(row_data)

                        result_store[index] = row_data
                        if not was_failed and is_failed:
                            failed_rows += 1
                        elif was_failed and not is_failed:
                            failed_rows = max(0, failed_rows - 1)

                        pending_buffer.append(row_data)
                        progress_bar.update(1)

                        if len(pending_buffer) >= self.flush_interval:
                            self._write_partial_results(result_store)
                            pending_buffer.clear()

                        self._write_progress(
                            status="running",
                            total_rows=total_rows,
                            completed_rows=len(result_store),
                            failed_rows=failed_rows,
                            output_file_path=self.output_file,
                        )

                        schedule_next()

            if pending_buffer:
                self._write_partial_results(result_store)

            final_df = self._build_final_output(df, result_store)
            self._write_table(final_df, self.output_file)
            self._write_progress(
                status="completed",
                total_rows=total_rows,
                completed_rows=len(result_store),
                failed_rows=failed_rows,
                output_file_path=self.output_file,
            )
            print(f"\n[*] Boom! 引擎执行完毕，结果已封存在: {self.output_file}")
        except Exception as error:
            self._write_progress(
                status="failed",
                total_rows=total_rows,
                completed_rows=len(result_store),
                failed_rows=failed_rows,
                output_file_path=self.output_file,
            )
            raise error


def main():
    parser = argparse.ArgumentParser(
        description="Universal Data Refining Engine (Powered by LLM)"
    )
    parser.add_argument("-c", "--config", required=True, help="YAML 配置文件的路径")
    parser.add_argument("-i", "--input", required=True, help="输入的 Excel/CSV 文件路径")
    parser.add_argument("-o", "--output", required=True, help="输出的 Excel/CSV 文件路径")
    parser.add_argument("--context", required=True, help="本次分析的全局背景（Global Context）")
    parser.add_argument("--concurrency", type=int, default=5, help="并发数，默认 5")
    parser.add_argument("--api-key", help="可选：直接传入 API KEY，默认读取环境变量")
    parser.add_argument("--base-url", help="可选：兼容 OpenAI SDK 的服务地址")
    parser.add_argument("--model", help="可选：模型名称，优先级高于配置文件")
    parser.add_argument("--progress-file", help="可选：运行进度文件路径")

    args = parser.parse_args()

    if os.name == "nt":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    engine = UniversalDataRefiner(
        config_path=args.config,
        input_file=args.input,
        output_file=args.output,
        api_key=args.api_key,
        base_url=args.base_url,
        model_name=args.model,
        concurrency=args.concurrency,
        progress_file=args.progress_file,
    )

    asyncio.run(engine.run(global_context=args.context))


if __name__ == "__main__":
    main()
