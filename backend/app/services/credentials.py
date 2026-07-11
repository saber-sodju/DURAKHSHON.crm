import re
import secrets
import string

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import User

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
    # Tajik-specific Cyrillic letters
    "ӣ": "i", "ӯ": "u", "ҳ": "h", "ҷ": "j", "қ": "q", "ғ": "gh", "ё": "yo",
}


def _translit_slug(text: str) -> str:
    """Best-effort Cyrillic (Russian/Tajik) -> Latin transliteration, then slugify to
    a-z0-9 only. Falls back to an empty string if nothing usable remains, so callers
    can fall back to a generic id-based username."""
    out = []
    for ch in text.lower():
        out.append(_TRANSLIT.get(ch, ch))
    slug = "".join(out)
    slug = re.sub(r"[^a-z0-9.]+", "", slug)
    slug = re.sub(r"\.+", ".", slug).strip(".")
    return slug


def generate_username(db: Session, first_name: str, last_name: str, *, prefix: str = "") -> str:
    """Generates a unique username like 'ali.rahmonov' (student) or
    'parent.ali.rahmonov' (parent), appending a number if taken."""
    base = _translit_slug(f"{first_name}.{last_name}")
    if not base:
        base = prefix or "user"
    if prefix:
        base = f"{prefix}.{base}"
    candidate = base
    n = 1
    while db.query(User).filter(User.username == candidate).first() is not None:
        n += 1
        candidate = f"{base}{n}"
    return candidate


_PASSWORD_LETTERS_LOWER = "abcdefghjkmnpqrstuvwxyz"  # skip ambiguous i/l/o
_PASSWORD_LETTERS_UPPER = _PASSWORD_LETTERS_LOWER.upper()
_PASSWORD_DIGITS = "23456789"  # skip ambiguous 0/1
_PASSWORD_SYMBOLS = "!@#$%&*"


def generate_temp_password(length: int = 12) -> str:
    """Cryptographically random temporary password: letters (upper+lower), digits and
    symbols, guaranteed at least one of each class. Never persisted in plaintext —
    callers must hash it immediately and return it to the caller exactly once."""
    pools = [_PASSWORD_LETTERS_LOWER, _PASSWORD_LETTERS_UPPER, _PASSWORD_DIGITS, _PASSWORD_SYMBOLS]
    chars = [secrets.choice(pool) for pool in pools]
    all_chars = string.ascii_letters + _PASSWORD_DIGITS + _PASSWORD_SYMBOLS
    chars += [secrets.choice(all_chars) for _ in range(max(0, length - len(chars)))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def create_login_account(
    db: Session, *, first_name: str, last_name: str, role: str, username_prefix: str,
) -> tuple[User, str]:
    """Creates a User row with an auto-generated unique username and a random
    temporary password (forcing a change on first login). Returns (user, plaintext
    password) — the plaintext is never stored, only returned once for display."""
    username = generate_username(db, first_name, last_name, prefix=username_prefix)
    password = generate_temp_password()
    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        full_name=f"{first_name} {last_name}",
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    return user, password
