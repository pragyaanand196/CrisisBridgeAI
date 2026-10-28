import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.schemas.auth import TokenPayload

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        token_data = TokenPayload(sub=user_id, role=payload.get("role"))
    except JWTError:
        return None
    
    user = db.query(User).filter(User.id == int(token_data.sub)).first()
    if user is None or not user.is_active:
        return None
    return user

def require_authenticated_user(current_user: Optional[User] = Depends(get_current_user)) -> User:
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to perform this action.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user

def require_authority(current_user: User = Depends(require_authenticated_user)) -> User:
    if current_user.role not in ["authority", "administrator"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Disaster Management Authorities and Administrators."
        )
    return current_user

def require_citizen(current_user: User = Depends(require_authenticated_user)) -> User:
    if current_user.role != "citizen":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Citizen accounts."
        )
    return current_user

def require_admin(current_user: User = Depends(require_authenticated_user)) -> User:
    if current_user.role != "administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Platform Administrators."
        )
    return current_user


