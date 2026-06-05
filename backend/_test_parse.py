"""Temporary script to test Lark parsing of SysML v2 text."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import lark

parser = lark.Lark.open(
    'app/services/parser/grammar/sysml2.lark',
    parser='lalr',
    debug=False
)

# Test 1: Simple part definition
text1 = 'part def Vehicle { attribute mass: Real; }'
tree1 = parser.parse(text1)
print('Test 1 (part def): OK')
print(tree1.pretty())

# Test 2: Multiple features
text2 = """
part def Vehicle {
    attribute mass: Real;
    attribute speed: Real = 0.0;
    port pwr: Port;
}
"""
tree2 = parser.parse(text2)
print('\nTest 2 (multi-feature): OK')
print(tree2.pretty())

# Test 3: Package
text3 = """
package MyPkg {
    part def Engine {
        attribute power: Real;
    }
}
"""
tree3 = parser.parse(text3)
print('\nTest 3 (package): OK')
print(tree3.pretty())

# Test 4: Relationships
text4 = 'connect a::b to c::d;'
tree4 = parser.parse(text4)
print('\nTest 4 (connect): OK')
print(tree4.pretty())

# Test 5: Constraint
text5 = 'constraint def C1 (x: Real, y: Real) { x + y > 0 }'
tree5 = parser.parse(text5)
print('\nTest 5 (constraint): OK')
print(tree5.pretty())

# Test 6: Syntax error
print('\nTest 6 (syntax error):')
try:
    tree6 = parser.parse('part def { invalid }')
except Exception as e:
    print(f'  Error: {e}')
    print(f'  Type: {type(e).__name__}')

# Test 7: Requirement
text7 = '''
requirement def REQ-001 {
    id "REQ-001";
    text "The system shall provide real-time monitoring.";
}
'''
tree7 = parser.parse(text7)
print('\nTest 7 (requirement): OK')
print(tree7.pretty())

# Test 8: All main types
text8 = 'part def A {}; item def B {}; port def C {}; interface def D {}; action def E {}; state def F {}; enumeration def G {};'
tree8 = parser.parse(text8)
print('\nTest 8 (all def types): OK')

# Test 9: Usages with type
text9 = 'part engine: Engine;'
tree9 = parser.parse(text9)
print('Test 9 (typed usage): OK')

# Test 10: Binding
text10 = 'binding b1 connect a::p1 to b::p2;'
tree10 = parser.parse(text10)
print('Test 10 (binding): OK')

print('\nAll tests passed!')
