import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import User
from app.db.session import SessionLocal


def upsert_seed_user(
    db: Session,
    *,
    email: str,
    password: str,
    display_name: str,
    role: str = "member",
) -> User:
    normalized_email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))

    if user is None:
        user = User(email=normalized_email, password_hash="", display_name=display_name)
        db.add(user)

    user.password_hash = hash_password(password)
    user.display_name = display_name
    user.role = role
    user.is_active = True

    db.commit()
    db.refresh(user)
    return user


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create or update a local platform user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--role", default="member")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    with SessionLocal() as db:
        user = upsert_seed_user(
            db,
            email=args.email,
            password=args.password,
            display_name=args.display_name,
            role=args.role,
        )
    print(f"Seeded active {user.role} user: {user.email}")


if __name__ == "__main__":
    main()
