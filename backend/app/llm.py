from __future__ import annotations
import os
import re
import json
import time
import logging
from typing import Type, TypeVar, Optional, Dict, Any, List
from pydantic import BaseModel, ValidationError
import httpx
from app.config import get_settings

logger = logging.getLogger("nexus.llm")

T = TypeVar("T", bound=BaseModel)

# Regex to strip <think>...</think> emitted by reasoning models like Qwen
_THINK_TAG_REGEX = re.compile(r'<think>[\s\S]*?</think>', re.DOTALL)
_PARTIAL_THINK_REGEX = re.compile(r'<think>[\s\S]*$', re.DOTALL)

def strip_think_tags(text: str) -> str:
    """Removes thinking / chain-of-thought blocks from model output."""
    if not text:
        return ""
    cleaned = _THINK_TAG_REGEX.sub('', text)
    cleaned = _PARTIAL_THINK_REGEX.sub('', cleaned)
    return cleaned.strip()

def truncate_text(text: str, max_chars: int = 10000) -> str:
    """
    Truncates text preserving head and tail if it exceeds max_chars.
    Keeps 60% head and 40% tail with a clear truncation marker.
    """
    if len(text) <= max_chars:
        return text
    head_len = int(max_chars * 0.6)
    tail_len = int(max_chars * 0.4)
    omitted = len(text) - (head_len + tail_len)
    return f"{text[:head_len]}\n\n[... {omitted} characters truncated ...]\n\n{text[-tail_len:]}"

def extract_json_str(text: str) -> str:
    """Extracts JSON substring if enclosed in markdown code blocks or raw braces."""
    cleaned = strip_think_tags(text).strip()
    # Check for markdown code blocks
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', cleaned)
    if match:
        return match.group(1).strip()
    # Find outermost { ... } or [ ... ]
    first_brace = cleaned.find('{')
    last_brace = cleaned.rfind('}')
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return cleaned[first_brace:last_brace + 1].strip()
    return cleaned

class LLMService:
    def __init__(self):
        self.settings = get_settings()

    async def check_model_availability(self, model_id: str) -> bool:
        """
        Pings Groq API to verify model availability without raising exceptions.
        """
        if not self.settings.GROQ_API_KEY:
            return False

        headers = {
            "Authorization": f"Bearer {self.settings.GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        url = "https://api.groq.com/openai/v1/models"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    model_ids = [m.get("id") for m in data.get("data", [])]
                    return model_id in model_ids
                return False
        except Exception as e:
            logger.warning(f"Groq model check failed for {model_id}: {e}")
            return False

    async def check_groq_health(self) -> Dict[str, Any]:
        """Returns health status for primary and fallback models."""
        primary_avail = await self.check_model_availability(self.settings.GROQ_PRIMARY_MODEL)
        fallback_avail = await self.check_model_availability(self.settings.GROQ_FALLBACK_MODEL)
        return {
            "primary_model": self.settings.GROQ_PRIMARY_MODEL,
            "primary_available": primary_avail,
            "fallback_model": self.settings.GROQ_FALLBACK_MODEL,
            "fallback_available": fallback_avail
        }

    async def _call_groq_api(
        self,
        model: str,
        messages: List[Dict[str, str]],
        json_mode: bool = True,
        temperature: float = 0.1
    ) -> str:
        """Raw call to Groq /chat/completions with retry and exponential backoff on 429."""
        if not self.settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        body: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        backoffs = [1.0, 2.0]
        last_error = None

        for attempt, delay in enumerate([0.0] + backoffs):
            if delay > 0:
                logger.info(f"Rate limited or retrying. Backing off for {delay}s...")
                time.sleep(delay)

            try:
                async with httpx.AsyncClient(timeout=25.0) as client:
                    resp = await client.post(url, headers=headers, json=body)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data["choices"][0]["message"]["content"]
                    elif resp.status_code == 429:
                        last_error = f"HTTP 429 Rate Limit on model {model}"
                        continue
                    else:
                        raise RuntimeError(f"Groq API error ({resp.status_code}): {resp.text}")
            except httpx.TimeoutException:
                last_error = f"Groq timeout on model {model}"
            except Exception as e:
                last_error = str(e)

        raise RuntimeError(f"Failed calling Groq model {model}: {last_error}")

    async def generate_structured(
        self,
        schema: Type[T],
        system_prompt: str,
        user_prompt: str,
        fallback_prompt_modifier: str = ""
    ) -> T:
        """
        Executes an LLM call enforcing Pydantic schema validation.
        Flow:
        1. Try Primary model (one retry).
        2. Fallback to secondary model if primary fails.
        3. Parse JSON & validate with schema; if validation fails, retry with strict prompt.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        # 1. Primary Model Attempt
        raw_text = None
        current_model = self.settings.GROQ_PRIMARY_MODEL
        try:
            raw_text = await self._call_groq_api(current_model, messages, json_mode=True)
        except Exception as e:
            logger.warning(f"Primary model {current_model} failed: {e}. Trying fallback {self.settings.GROQ_FALLBACK_MODEL}")
            current_model = self.settings.GROQ_FALLBACK_MODEL
            try:
                raw_text = await self._call_groq_api(current_model, messages, json_mode=True)
            except Exception as e_fallback:
                logger.error(f"Fallback model {current_model} also failed: {e_fallback}")
                raise RuntimeError(f"Both primary and fallback LLM models failed. Error: {e_fallback}")

        # 2. JSON & Pydantic Validation
        try:
            json_text = extract_json_str(raw_text)
            parsed_data = json.loads(json_text)
            return schema.model_validate(parsed_data)
        except (json.JSONDecodeError, ValidationError) as parse_err:
            logger.warning(f"Initial schema validation failed for {schema.__name__}: {parse_err}. Retrying with strict prompt...")
            # Stricter prompt retry
            strict_messages = messages + [
                {"role": "assistant", "content": raw_text or ""},
                {
                    "role": "user",
                    "content": (
                        f"Your previous response failed validation with error: {parse_err}.\n"
                        f"Return ONLY valid, minified JSON matching this schema exactly without markdown formatting or code blocks:\n"
                        f"{json.dumps(schema.model_json_schema())}"
                    )
                }
            ]
            try:
                retry_text = await self._call_groq_api(current_model, strict_messages, json_mode=True)
                json_text = extract_json_str(retry_text)
                return schema.model_validate(json.loads(json_text))
            except Exception as final_err:
                logger.error(f"Schema validation failed after strict retry: {final_err}")
                raise RuntimeError(f"Failed to generate structured data for {schema.__name__}: {final_err}")

_llm_service: Optional[LLMService] = None

def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service

