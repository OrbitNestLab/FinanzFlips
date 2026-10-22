"""Read-only ING FinTS adapter. Secrets travel over stdin and live in RAM only.

No transfer/debit/order methods, no pickled state, no PIN files, no debug logs.
One short-lived process retains the bank dialog while the user answers a TAN.
"""
import sys
import json
import logging
from datetime import date, timedelta

logging.disable(logging.CRITICAL)


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def receive():
    line = sys.stdin.readline(100000)
    if not line:
        raise EOFError()
    return json.loads(line)


def signed_amount(amount, status=None):
    value = float(amount.amount)
    # mt940 5.1 retains legacy reversal handling unless explicitly corrected.
    if str(status or "").upper() in ("D", "RC"):
        return -abs(value)
    if str(status or "").upper() in ("C", "RD"):
        return abs(value)
    return value


def normalize_transaction(tx, uid):
    d = tx.data
    amount = d.get("amount")
    if not amount or getattr(amount, "currency", "EUR") not in (None, "EUR"):
        return None
    booking = d.get("entry_date") or d.get("date")
    if not booking:
        return None
    ref = str(d.get("bank_reference") or "")
    if ref in ("NONREF", "NOTPROVIDED"):
        ref = ""
    return {"bookingDate": str(booking), "date": str(booking),
            "amount": signed_amount(amount, d.get('status')), "currency": "EUR",
            "merchant": str(d.get("applicant_name") or d.get("purpose") or "ING-Buchung")[:250],
            "description": str(d.get("purpose") or d.get("transaction_details") or "")[:2000],
            "counterpartyIban": str(d.get("applicant_iban") or ""),
            "providerReference": ref, "syncId": uid + ":" + ref if ref else "",
            "category": "Nicht zugeordnet"}


def main():
    from fints.client import FinTS3PinTanClient, NeedTANResponse
    args = receive()
    if not args.get("productId") or not args.get("username") or not args.get("pin"):
        emit({"type": "error", "message": "Produkt-ID, ING-Zugang und PIN werden benötigt."})
        return
    f = FinTS3PinTanClient('50010517', args['username'], args['pin'],
                          'https://fints.ing.de/fints/', product_id=args['productId'], product_version='2.1')
    args.clear()

    def solve(result):
        count = 0
        while isinstance(result, NeedTANResponse):
            count += 1
            if count > 20:
                raise RuntimeError('Too many TAN steps')
            emit({"type": "challenge", "text": str(result.challenge or 'Bitte die Anmeldung bei ING bestätigen.')[:3000],
                  "decoupled": bool(result.decoupled)})
            answer = receive()
            result = f.send_tan(result, '' if result.decoupled else str(answer.get('tan', '')))
        return result

    if not f.get_current_tan_mechanism():
        f.fetch_tan_mechanisms()
        methods = list(f.get_tan_mechanisms().items())
        if len(methods) > 1:
            emit({"type": "methods", "choices": [{"id": str(k), "name": str(m.name)} for k, m in methods]})
            chosen = receive().get('choice')
            if chosen not in [str(k) for k, _ in methods]:
                raise ValueError('Invalid method')
            f.set_tan_mechanism(chosen)
        elif len(methods) == 1:
            f.set_tan_mechanism(methods[0][0])
    if f.selected_tan_medium is None and f.is_tan_media_required():
        media = f.get_tan_media()[1]
        if len(media) == 1:
            f.set_tan_medium(media[0])
        elif not media:
            f.selected_tan_medium = ''
        else:
            emit({"type": "media", "choices": [{"id": str(i), "name": str(m.tan_medium_name)} for i, m in enumerate(media)]})
            index = int(receive().get('choice', '-1'))
            if index < 0 or index >= len(media):
                raise ValueError('Invalid medium')
            f.set_tan_medium(media[index])
    with f:
        if f.init_tan_response:
            solve(f.init_tan_response)
        accounts = solve(f.get_sepa_accounts())
        info = f.get_information().get('accounts', [])
        lookup = {a.get('iban'): a for a in info}
        choices = [{"id": str(i), "iban": a.iban,
                    "name": str(lookup.get(a.iban, {}).get('product_name') or 'ING-Konto'),
                    "currency": str(lookup.get(a.iban, {}).get('currency') or 'EUR')}
                   for i, a in enumerate(accounts)]
        emit({"type": "accounts", "choices": choices})
        selected = receive().get('accounts', [])
        if not isinstance(selected, list) or not selected:
            raise ValueError('No accounts selected')
        out, errors = [], []
        for i, a in enumerate(accounts):
            if str(i) not in selected:
                continue
            if choices[i]['currency'] != 'EUR':
                errors.append('Ein Fremdwährungskonto wurde übersprungen.')
                continue
            uid = 'fints-ing:' + a.iban
            balance = solve(f.get_balance(a))
            transactions = solve(f.get_transactions(a, start_date=date.today()-timedelta(days=366), end_date=date.today(), include_pending=False))
            rows = [normalize_transaction(t, uid) for t in transactions]
            name = choices[i]['name']
            out.append({"uid": uid, "iban": a.iban, "bank": "ING", "country": "DE", "source": "fints",
                        "name": name, "displayType": 'Tagesgeld' if 'extra' in name.lower() or 'spar' in name.lower() else 'Girokonto',
                        "currency": "EUR", "balance": signed_amount(balance.amount, getattr(balance,'status',None)), "balanceType": "CLBD",
                        "balanceDate": str(balance.date or date.today()), "transactions": [t for t in rows if t]})
        emit({"type": "result", "accounts": out, "errors": errors})


if __name__ == '__main__':
    try:
        main()
    except EOFError:
        pass
    except Exception as exc:
        # Exception messages may contain raw FinTS segments or credentials.
        name = type(exc).__name__
        if 'PIN' in name or 'Auth' in name:
            message = 'ING hat die Anmeldung abgelehnt. Zugangsdaten prüfen; keine automatische Wiederholung.'
        elif 'SCA' in name:
            message = 'ING verlangt eine erneute Freigabe. Bitte die Anmeldung neu starten.'
        else:
            message = 'Der ING-FinTS-Abruf konnte nicht abgeschlossen werden. Produktregistrierung, Zugang und Freigabe prüfen.'
        emit({"type": "error", "message": message})
