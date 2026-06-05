"""Temporary script to test Lark grammar compilation."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import lark
try:
    parser = lark.Lark.open(
        'app/services/parser/grammar/sysml2.lark',
        parser='lalr',
        debug=True
    )
    print('SUCCESS: Grammar compiled without LALR(1) conflicts')
except Exception as e:
    print(f'ERROR: {e}')
    import traceback
    traceback.print_exc()
