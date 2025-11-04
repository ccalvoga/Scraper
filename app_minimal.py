from flask import Flask

app = Flask(__name__)

@app.route('/')
def index():
    return '''
<!DOCTYPE html>
<html>
<head>
    <title>Test Mínimo</title>
</head>
<body>
    <h1>Flask funciona!</h1>
    <button onclick="alert('JavaScript funciona!')">Click aquí</button>
</body>
</html>
'''

if __name__ == '__main__':
    print("Flask mínimo iniciando en http://localhost:5001")
    app.run(debug=False, port=5001)
