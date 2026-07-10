"""Create the first real director account interactively.

Usage:
    python -m app.commands.create_director

Prompts for username, email, password, first and last name. Can also be driven
non-interactively with flags (useful for scripted first-run setup):
    python -m app.commands.create_director --username ... --password ... --yes
"""
import argparse
import getpass
import sys

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User, Role


def create(username: str, email: str | None, password: str, full_name: str) -> None:
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first():
            print(f"Username '{username}' already exists.")
            sys.exit(1)
        if email and db.query(User).filter(User.email == email).first():
            print(f"Email '{email}' already in use.")
            sys.exit(1)
        user = User(
            username=username,
            email=email or None,
            password_hash=hash_password(password),
            role=Role.DIRECTOR.value,
            full_name=full_name,
            is_active=True,
        )
        db.add(user)
        db.commit()
        print(f"Director '{username}' created (id={user.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--username")
    parser.add_argument("--email", default="")
    parser.add_argument("--password")
    parser.add_argument("--first-name", default="")
    parser.add_argument("--last-name", default="")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    # in scripted mode (--yes) never prompt; rely on the flags provided
    prompt = not args.yes
    username = args.username or (input("Username: ").strip() if prompt else "")
    email = args.email or (input("Email (optional): ").strip() if prompt else "")
    first_name = args.first_name or (input("First name: ").strip() if prompt else "")
    last_name = args.last_name or (input("Last name: ").strip() if prompt else "")
    if not username:
        print("Username is required (--username).")
        sys.exit(1)
    if args.password:
        password = args.password
    else:
        password = getpass.getpass("Password (min 8 chars): ")
        if len(password) < 8:
            print("Password must be at least 8 characters.")
            sys.exit(1)
        if getpass.getpass("Confirm password: ") != password:
            print("Passwords do not match.")
            sys.exit(1)

    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    full_name = f"{first_name} {last_name}".strip()
    if not args.yes:
        print(f"\nCreate director:\n  username: {username}\n  email: {email or '(none)'}\n  name: {full_name or '(none)'}")
        if input("Continue? [y/N] ").strip().lower() != "y":
            print("Aborted.")
            sys.exit(1)

    create(username, email, password, full_name)
