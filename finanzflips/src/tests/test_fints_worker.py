import unittest
import importlib.util
import pathlib
import sys
import types
from datetime import date
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('worker', pathlib.Path(__file__).parents[1] / 'fints-worker.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

class WorkerTests(unittest.TestCase):
    def test_normalize_booked_credit_debit_and_foreign_currency(self):
        def row(value, currency='EUR'):
            return types.SimpleNamespace(data={'amount': types.SimpleNamespace(amount=value, currency=currency), 'entry_date': date(2026,10,21), 'applicant_name':'Test', 'purpose':'Sparen', 'bank_reference':'NONREF'})
        self.assertEqual(w.normalize_transaction(row(-12.34),'uid')['amount'], -12.34)
        self.assertEqual(w.normalize_transaction(row(100),'uid')['amount'], 100)
        self.assertEqual(w.normalize_transaction(row(100),'uid')['providerReference'], '')
        self.assertIsNone(w.normalize_transaction(row(100,'USD'),'uid'))

    def test_full_read_only_flow_with_bank_challenge_and_account_choice(self):
        calls=[]
        class NeedTAN: pass
        class Client:
            def __init__(self,*args,**kw):
                calls.append(('init',args[0],args[3]));self.selected_tan_medium='';self.init_tan_response=NeedTAN();self.init_tan_response.challenge='Bitte bestätigen';self.init_tan_response.decoupled=True
            def get_current_tan_mechanism(self):return '999'
            def __enter__(self):return self
            def __exit__(self,*a):return False
            def send_tan(self,r,t):calls.append(('tan',t));return None
            def get_sepa_accounts(self):return [types.SimpleNamespace(iban='DETEST')]
            def get_information(self):return {'accounts':[{'iban':'DETEST','product_name':'Extra-Konto','currency':'EUR'}]}
            def get_balance(self,a):calls.append(('balance',a.iban));return types.SimpleNamespace(amount=types.SimpleNamespace(amount=1234,currency='EUR'),date=date(2026,10,21))
            def get_transactions(self,a,**kwargs):calls.append(('transactions',kwargs['include_pending']));return []
        events=[];answers=iter([{'username':'u','pin':'p','productId':'registered'}, {}, {'accounts':['0']}]);fake=types.ModuleType('fints.client');fake.FinTS3PinTanClient=Client;fake.NeedTANResponse=NeedTAN
        with patch.dict(sys.modules,{'fints.client':fake}),patch.object(w,'receive',lambda:next(answers)),patch.object(w,'emit',events.append):w.main()
        self.assertEqual([x['type'] for x in events],['challenge','accounts','result'])
        self.assertEqual(events[-1]['accounts'][0]['displayType'],'Tagesgeld')
        self.assertEqual(events[-1]['accounts'][0]['balance'],1234)
        self.assertIn(('transactions',False),calls)
        self.assertEqual(calls[0],('init','50010517','https://fints.ing.de/fints/'))

if __name__=='__main__': unittest.main()
