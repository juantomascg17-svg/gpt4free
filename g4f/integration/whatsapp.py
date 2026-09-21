from __future__ import annotations

import hashlib
import hmac
import logging
import os
from typing import Callable, Optional

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v21.0"


class WhatsAppError(Exception):
    """Raised when the WhatsApp Cloud API returns an error response."""


def has_whatsapp_config() -> bool:
    """True if the environment holds enough config to send messages."""
    return bool(os.environ.get("WHATSAPP_TOKEN")) and bool(os.environ.get("WHATSAPP_PHONE_NUMBER_ID"))


class WhatsAppClient:
    """Thin wrapper around the WhatsApp Business Cloud API (Meta Graph API)."""

    def __init__(
        self,
        token: str = None,
        phone_number_id: str = None,
        api_version: str = GRAPH_API_VERSION,
    ):
        self.token = token or os.environ.get("WHATSAPP_TOKEN")
        self.phone_number_id = phone_number_id or os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
        if not self.token or not self.phone_number_id:
            raise WhatsAppError(
                "WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required "
                "(pass them as arguments or set them as environment variables)"
            )
        self.api_version = api_version
        self.base_url = f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}"

    def _post(self, payload: dict) -> dict:
        response = requests.post(
            f"{self.base_url}/messages",
            headers={"Authorization": f"Bearer {self.token}"},
            json=payload,
            timeout=20,
        )
        if response.status_code >= 400:
            raise WhatsAppError(f"WhatsApp API error {response.status_code}: {response.text}")
        return response.json()

    def send_text(self, to: str, body: str, preview_url: bool = False) -> dict:
        """Send a free-form text message. Only works within the 24h customer service window."""
        return self._post({
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": body, "preview_url": preview_url},
        })

    def send_template(
        self,
        to: str,
        template_name: str,
        language_code: str = "en_US",
        components: Optional[list] = None,
    ) -> dict:
        """Send a pre-approved template message. Required to start a conversation."""
        template = {"name": template_name, "language": {"code": language_code}}
        if components:
            template["components"] = components
        return self._post({
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": template,
        })

    def mark_as_read(self, message_id: str) -> dict:
        return self._post({
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        })


def verify_signature(app_secret: str, payload: bytes, signature_header: Optional[str]) -> bool:
    """Verify the X-Hub-Signature-256 header Meta sends with every webhook call."""
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), payload, hashlib.sha256).hexdigest()
    provided = signature_header.split("sha256=", 1)[1]
    return hmac.compare_digest(expected, provided)


def create_whatsapp_router(
    verify_token: str = None,
    app_secret: str = None,
    on_message: Optional[Callable[[dict], None]] = None,
) -> APIRouter:
    """
    Build the FastAPI router exposing the WhatsApp Cloud API webhook.

    GET  /whatsapp/webhook  - Meta's verification handshake (hub.challenge)
    POST /whatsapp/webhook  - incoming message/status notifications

    `on_message` is called once per incoming message dict (Meta's raw message
    object). If omitted, incoming messages are only logged.
    """
    verify_token = verify_token or os.environ.get("WHATSAPP_VERIFY_TOKEN")
    app_secret = app_secret or os.environ.get("WHATSAPP_APP_SECRET")
    router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

    @router.get("/webhook")
    async def verify_webhook(
        mode: str = Query(None, alias="hub.mode"),
        token: str = Query(None, alias="hub.verify_token"),
        challenge: str = Query(None, alias="hub.challenge"),
    ):
        if mode == "subscribe" and verify_token and token == verify_token:
            return Response(content=challenge, media_type="text/plain")
        raise HTTPException(status_code=403, detail="Verification failed")

    @router.post("/webhook")
    async def receive_webhook(request: Request):
        raw_body = await request.body()
        if app_secret and not verify_signature(app_secret, raw_body, request.headers.get("X-Hub-Signature-256")):
            raise HTTPException(status_code=403, detail="Invalid signature")
        payload = await request.json()
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                for message in change.get("value", {}).get("messages", []):
                    if on_message:
                        on_message(message)
                    else:
                        logger.info("WhatsApp message received: %s", message)
        return {"status": "ok"}

    return router
