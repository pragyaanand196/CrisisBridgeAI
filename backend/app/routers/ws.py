import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from backend.app.config import settings
from backend.app.services.websocket_manager import ws_manager

router = APIRouter(tags=["WebSockets"])
logger = logging.getLogger("crisisbridge.ws")

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    user_id = None
    role = None
    if token:
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            sub = payload.get("sub")
            if sub:
                user_id = int(sub)
                role = payload.get("role")
        except JWTError:
            logger.warning("WebSocket connection attempted with invalid or expired token")

    await ws_manager.connect(websocket, user_id=user_id, role=role)
    try:
        # Send initial confirmation message
        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "message": "CrisisBridge AI Real-Time WebSocket Channel Active",
            "authenticated": user_id is not None,
            "role": role
        })
        while True:
            # Keep connection alive & handle incoming pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client session terminated: {e}")
        ws_manager.disconnect(websocket)
