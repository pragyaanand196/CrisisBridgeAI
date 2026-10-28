import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("crisisbridge.ws")

class ConnectionManager:
    def __init__(self):
        # Active connections list
        self.active_connections: List[WebSocket] = []
        # Connection metadata: websocket -> {"user_id": ..., "role": ...}
        self.connection_meta: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, user_id: Optional[int] = None, role: Optional[str] = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_meta[websocket] = {"user_id": user_id, "role": role}
        logger.info(f"WebSocket client connected (user_id={user_id}, role={role}). Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.connection_meta:
            del self.connection_meta[websocket]
        logger.info(f"WebSocket client disconnected. Total active: {len(self.active_connections)}")

    async def send_personal_message(self, message: Dict[str, Any], user_id: int):
        """Send message only to a specific user's active connections."""
        payload = json.dumps(message)
        for conn in list(self.active_connections):
            meta = self.connection_meta.get(conn, {})
            if meta.get("user_id") == user_id:
                try:
                    await conn.send_text(payload)
                except Exception as e:
                    logger.warning(f"Failed to send to user {user_id}: {e}")
                    self.disconnect(conn)

    async def broadcast(self, event_type: str, data: Dict[str, Any], target_role: Optional[str] = None):
        """
        Broadcasts a JSON message payload to connected clients, optionally filtered by role.
        """
        message = json.dumps({
            "type": event_type,
            "data": data
        })
        disconnected_clients = []
        for connection in list(self.active_connections):
            meta = self.connection_meta.get(connection, {})
            if target_role and meta.get("role") and meta.get("role") != target_role:
                continue
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected_clients.append(connection)
        
        # Clean up stale connections
        for dead_conn in disconnected_clients:
            self.disconnect(dead_conn)

ws_manager = ConnectionManager()
