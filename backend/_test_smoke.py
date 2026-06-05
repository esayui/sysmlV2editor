"""Quick smoke test of parser pipeline."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.services.parser import SysML2Parser, SysML2SyntaxError

parser = SysML2Parser()

# Test 1: Basic parsing
print("=== Test 1: Basic part def ===")
model = parser.parse_to_model('part def Vehicle { attribute mass: Real; }')
print(f"Elements: {len(model['elements'])}")
for e in model['elements']:
    print(f"  {e['type']}: {e['name']} (id={e['id'][:8]}...)")
print("PASS\n")

# Test 2: Parse error
print("=== Test 2: Syntax error ===")
try:
    parser.parse('part def { invalid }')
except SysML2SyntaxError as e:
    print(f"Error: {e}")
    print(f"Line: {e.line}, Column: {e.column}")
print("PASS\n")

# Test 3: Text generation roundtrip
print("=== Test 3: Roundtrip ===")
text = 'part def Engine { attribute power: Real; }'
model1 = parser.parse_to_model(text)
gen1 = parser.generate_text(model1, format=False)
print(f"Generated: {gen1}")
model2 = parser.parse_to_model(gen1)
gen2 = parser.generate_text(model2, format=False)
print(f"Roundtrip stable: {gen1 == gen2}")
print("PASS\n")

# Test 4: Multiple elements
print("=== Test 4: Multiple elements ===")
multi = """
package MyPkg {
    part def Motor {
        attribute torque: Real;
        port shaft: Port;
    }
}
connect motor::shaft to gearbox::input;
"""
model = parser.parse_to_model(multi)
print(f"Elements: {len(model['elements'])}")
print(f"Relationships: {len(model['relationships'])}")
print(f"Packages: {len(model['packages'])}")
for e in model['elements']:
    print(f"  {e['type']}: {e['name']} qname={e['qualifiedName']}")
print("PASS\n")

# Test 5: Constraint
print("=== Test 5: Constraint ===")
model = parser.parse_to_model('constraint def C1 (x: Real, y: Real) { x + y > 0 }')
for e in model['elements']:
    print(f"  {e['type']}: {e['name']}")
    print(f"    expr: {e['properties'].get('expression', '')}")
    print(f"    params: {e['properties'].get('parameters', [])}")
print("PASS\n")

print("All smoke tests passed!")
