from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    print("Iniciando Flask en modo TEST...")
    print("Abre: http://localhost:5001")
    app.run(debug=False, port=5001)
