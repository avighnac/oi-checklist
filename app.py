from flask import Flask, render_template, request, redirect, session, jsonify
import sqlite3
import hashlib
import os
from dotenv import load_dotenv
import secrets

load_dotenv()  # Load environment variables from .env

app = Flask(__name__)
app.secret_key = "your-secret-key"

def get_db():
    db_path = os.getenv("DATABASE_PATH", "database.db")  # fallback to "database.db" if not set
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

@app.route("/")
def home():
    if "user_id" in session:
        return redirect("/dashboard")
    return redirect("/login")

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        salt = secrets.token_urlsafe(32) 
        password = hashlib.sha256((request.form["password"] + salt).encode()).hexdigest()
        db = get_db()
        try:
            db.execute("INSERT INTO users (username, password, salt) VALUES (?, ?, ?)", (username, password, salt))
            db.commit()
        except Exception as e:
            print(e)
            return "Username taken"
        return redirect("/login")
    return render_template("register.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if not user or hashlib.sha256((request.form["password"] + user["salt"]).encode()).hexdigest() != user["password"]:
            # If username doesn't exist or hash(inputted password + salt) is not the given password hash, then return
            return "Invalid credentials"
        session["user_id"] = user["id"]
        return redirect("/dashboard")
        
    return render_template("login.html")

def get_all_noi_years(problems_by_category):
    years = set()
    for cat in ['NOIQUAL', 'NOIPRELIM', 'NOIFINAL']:
        years.update(problems_by_category.get(cat, {}).keys())
    return sorted(years)

@app.route('/dashboard')
def dashboard():
    if "user_id" not in session:
        return redirect("/login")
    user_id = session.get('user_id')
    db = get_db()

    # Fetch all problems
    problems_raw = db.execute(
        'SELECT * FROM problems ORDER BY year, number'
    ).fetchall()

    # Fetch user progress (status and score!)
    progress_rows = db.execute(
        'SELECT problem_name, source, year, status, score FROM problem_statuses WHERE user_id = ?',
        (user_id,)
    ).fetchall()
    progress = {
        (row['problem_name'], row['source'], row['year']): {
            'status': row['status'],
            'score': row['score']
        }
        for row in progress_rows
    }

    # Group by category -> year -> problems
    problems_by_category = {}
    for row in problems_raw:
        category = row['source']
        year = row['year']
        problem = dict(row)

        key = (problem['name'], problem['source'], problem['year'])
        if key in progress:
            problem['status'] = progress[key]['status']
            problem['score'] = progress[key]['score']
        else:
            problem['status'] = 0
            problem['score'] = 0

        problems_by_category.setdefault(category, {})
        problems_by_category[category].setdefault(year, [])
        problems_by_category[category][year].append(problem)

    all_noi_years = get_all_noi_years(problems_by_category)
    return render_template("dashboard.html", problems_by_category=problems_by_category, all_noi_years=all_noi_years)

@app.route('/api/update-problem-status', methods=['POST'])
def update_problem_status():
    data = request.get_json()
    user_id = session.get('user_id')
    problem_name = data['problem_name']
    source = data['source']
    year = data['year']
    status = data['status']

    db = get_db()
    db.execute(
        '''
        INSERT INTO problem_statuses (user_id, problem_name, source, year, status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, problem_name, source, year)
        DO UPDATE SET status = ?
        ''',
        (user_id, problem_name, source, year, status, status)
    )
    db.commit()
    db.close()
    return jsonify(success=True)

@app.route('/api/update-problem-score', methods=['POST'])
def update_problem_score():
    data = request.get_json()
    user_id = session.get('user_id')
    problem_name = data['problem_name']
    source = data['source']
    year = data['year']
    score = data['score']

    db = get_db()
    db.execute(
        '''
        INSERT INTO problem_statuses (user_id, problem_name, source, year, score)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, problem_name, source, year)
        DO UPDATE SET score = ?
        ''',
        (user_id, problem_name, source, year, score, score)
    )
    db.commit()
    db.close()
    return jsonify(success=True)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")

if __name__ == "__main__":
    app.run(debug=True)
