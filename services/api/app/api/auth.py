from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_access_token, verify_password
from app.db.models import User
from app.db.session import get_db
from app.services.audit import record_audit_log

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    record_audit_log(
        db,
        actor_id=user.id,
        action="auth.login",
        target_type="user",
        target_id=user.id,
        detail={"email": user.email},
    )
    return LoginResponse(access_token=create_access_token(user.id))


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(status_code=401, detail="Invalid authentication credentials")
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except JWTError as exc:
        raise credentials_error from exc

    if not user_id:
        raise credentials_error

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_error
    return user
