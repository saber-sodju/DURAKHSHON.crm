from datetime import date
from decimal import Decimal


def compute_payment_status(
    amount: Decimal, paid_amount: Decimal, due_date: date | None, today: date | None = None
) -> str:
    """Business rules:
    - paid_amount >= amount  -> paid
    - 0 < paid_amount < amount -> partial
    - paid_amount == 0 and due_date passed -> overdue
    - otherwise -> unpaid
    """
    today = today or date.today()
    if paid_amount >= amount:
        return "paid"
    if paid_amount > 0:
        return "partial"
    if due_date is not None and due_date < today:
        return "overdue"
    return "unpaid"
